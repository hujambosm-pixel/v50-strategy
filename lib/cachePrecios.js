// lib/cachePrecios.js — lógica PURA de la caché de precios (tablas precios_diarios y precios_simbolos,
// ver sql/precios_cache.sql). No habla con Supabase ni con Yahoo: recibe velas y decide. Quien la use
// (fetchAVDetalle, el script de llenado) hace las lecturas y escrituras.
//
// Una vela es { date: 'YYYY-MM-DD', open, high, low, close, volume } —la forma que ya usa el motor— y
// puede llevar `enCurso: true` (lib/sesion.js). En la base de datos las columnas se llaman fecha y
// volumen: aFilasBd y deColumnasBd traducen.
//
// LA REGLA DE LA CACHÉ: solo velas diarias CERRADAS. La vela en curso nunca se guarda, ni ninguna con
// fecha de hoy (UTC) o futura, que es la misma regla que aplica guardar_velas en la base de datos.
//
// COPIA EXACTA DE YAHOO. Una vela INCOHERENTE —algún precio <= 0, low > high, u open o close fuera de
// [low, high]— se guarda tal cual, porque es lo que usa el motor: CL=F tiene precios negativos en abril
// de 2020, GC=F y SI=F cierres de liquidación fuera del rango del día y XSPS.L cierres de subasta. Se
// cuentan (esAnomala; precios_simbolos.velas_anomalas en la base de datos) para poder avisar.
//
// SPLITS Y CORRECCIONES. Cuando una empresa hace un split, Yahoo reescribe todo el histórico hacia atrás
// (NVDA, 10:1 el 2024-06-10: el cierre del 2024-06-07 pasó de 1208,88 a 120,888). Al actualizar se
// comparan las ÚLTIMAS velas guardadas con las que devuelve Yahoo:
//   · las 8 más antiguas de las 10 últimas tienen que coincidir (umbral 0,01 %); si alguna difiere, o
//     ha desaparecido, el histórico guardado ya no es el de Yahoo y hay que RECARGAR el símbolo entero;
//   · las 2 más recientes pueden diferir sin más —Yahoo corrige a veces el último cierre los días
//     siguientes— y se sobrescriben con lo nuevo.
// Los precios de Yahoo están ajustados por splits pero no por dividendos, así que un dividendo no
// reescribe el histórico y no provoca recargas.

export const VENTANA_SOLAPE = 10          // últimas velas guardadas que se comparan
export const FIRMES = 8                   // de ellas, las más antiguas, que tienen que coincidir
export const UMBRAL = 0.0001              // 0,01 % de diferencia relativa
const CAMPOS = ['open', 'high', 'low', 'close']

const fechaHoyUTC = (ahora = new Date()) => ahora.toISOString().slice(0, 10)
const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const esFecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)
const ordena = (velas) => [...velas].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
const pct = (v) => (v * 100).toFixed(2).replace('.', ',')

// Las velas que se pueden GUARDAR: cerradas, anteriores a hoy (UTC) y completas, con open, high, low y
// close numéricos y finitos; sin fechas repetidas (manda la última). Son las reglas de guardar_velas.
// Las incoherentes SÍ entran (ver la cabecera). Lo demás se descarta sin más: no es caché.
export function velasCerradas(velas, hoy = fechaHoyUTC()) {
  if (!Array.isArray(velas)) return []
  const porFecha = new Map()
  for (const v of velas) {
    if (!v || v.enCurso || !esFecha(v.date) || v.date >= hoy) continue
    if (!CAMPOS.every(c => finito(v[c]))) continue
    porFecha.set(v.date, v)
  }
  return ordena(porFecha.values())
}

// Vela de baja calidad: algún precio <= 0, low > high, u open o close fuera de [low, high]. El mismo
// criterio con el que guardar_velas cuenta precios_simbolos.velas_anomalas.
export const esAnomala = (v) => CAMPOS.some(c => !(v[c] > 0)) || v.low > v.high ||
  v.open < v.low || v.open > v.high || v.close < v.low || v.close > v.high

// Une lo guardado con lo nuevo: para una misma fecha manda lo NUEVO (lo último que dice Yahoo). Sale
// ordenado y sin fechas repetidas.
export function combinaVelas(guardadas, nuevas) {
  const porFecha = new Map()
  for (const v of (Array.isArray(guardadas) ? guardadas : [])) if (v && esFecha(v.date)) porFecha.set(v.date, v)
  for (const v of (Array.isArray(nuevas) ? nuevas : [])) if (v && esFecha(v.date)) porFecha.set(v.date, v)
  return ordena(porFecha.values())
}

// Compara las últimas velas guardadas con las nuevas en el tramo en que se solapan.
// Devuelve { recargar, motivo, comparadas, diferencias, insuficiente }:
//   · recargar: alguna de las FIRMES difiere más que el umbral o ha desaparecido de lo nuevo;
//   · insuficiente: las nuevas no llegan a cubrir las firmes (hay que pedir más días a Yahoo para poder
//     decidir); en ese caso recargar es false y no se debe dar el solape por bueno.
export function comparaSolape(guardadas, nuevas, { ventana = VENTANA_SOLAPE, firmes = FIRMES, umbral = UMBRAL } = {}) {
  const g = ordena((Array.isArray(guardadas) ? guardadas : []).filter(v => v && esFecha(v.date)))
  const n = new Map((Array.isArray(nuevas) ? nuevas : []).filter(v => v && esFecha(v.date)).map(v => [v.date, v]))
  const ultimas = g.slice(-ventana)
  const aComparar = ultimas.slice(0, Math.max(0, ultimas.length - (ventana - firmes)))
  const resultado = { recargar: false, motivo: null, comparadas: 0, diferencias: [], insuficiente: false }
  if (!aComparar.length) return resultado
  // Lo nuevo tiene que empezar como muy tarde en la primera firme: si no, no cubre el solape.
  const primeraNueva = [...n.keys()].sort()[0]
  if (!primeraNueva || primeraNueva > aComparar[0].date) { resultado.insuficiente = true; return resultado }
  for (const v of aComparar) {
    const w = n.get(v.date)
    resultado.comparadas++
    if (!w) { resultado.diferencias.push({ date: v.date, campo: 'vela', guardado: true, nuevo: null }); continue }
    for (const c of CAMPOS) {
      if (!finito(v[c]) || !finito(w[c])) { resultado.diferencias.push({ date: v.date, campo: c, guardado: v[c], nuevo: w[c] }); continue }
      const rel = Math.abs(w[c] / v[c] - 1)
      if (rel > umbral) resultado.diferencias.push({ date: v.date, campo: c, guardado: v[c], nuevo: w[c], rel })
    }
  }
  if (resultado.diferencias.length) {
    resultado.recargar = true
    const d = resultado.diferencias.find(x => x.campo === 'close') || resultado.diferencias[0]
    resultado.motivo = d.campo === 'vela'
      ? `la vela guardada del ${d.date} ya no está en Yahoo`
      : `el ${d.campo} del ${d.date} difiere: guardado ${d.guardado} · Yahoo ${d.nuevo} (${d.rel != null ? (d.nuevo > d.guardado ? '+' : '-') + pct(d.rel) + ' %' : 'sin dato'}); ` +
        `${new Set(resultado.diferencias.map(x => x.date)).size} de ${resultado.comparadas} velas comparadas distintas`
  }
  return resultado
}

// Decide qué hacer con un símbolo al actualizar.
//   guardadas: lo que hay en la caché (cerradas)            nuevas: lo que acaba de devolver Yahoo
// Devuelve { accion, motivo, paraGuardar, combinadas }:
//   'recargar'      el histórico guardado ya no vale (split o corrección): hay que pedir a Yahoo TODO
//                   el histórico y guardarlo con reemplazar = true. combinadas va vacío a propósito: no
//                   se debe usar lo guardado.
//   'ampliar-solape' las nuevas no cubren el solape: pedir a Yahoo más días antes de decidir.
//   'guardar'       hay velas cerradas nuevas, o las 2 más recientes han cambiado: paraGuardar lleva
//                   exactamente esas, para guardar_velas.
//   'nada'          todo coincide y no hay nada nuevo (solo se marca revisado_en).
// Si no hay nada guardado, todo lo cerrado de las nuevas es paraGuardar.
export function decideActualizacion(guardadas, nuevas, { hoy = fechaHoyUTC(), ...opciones } = {}) {
  const g = velasCerradas(guardadas, hoy)
  const nc = velasCerradas(nuevas, hoy)
  if (!g.length) return { accion: nc.length ? 'guardar' : 'nada', motivo: null, paraGuardar: nc, combinadas: nc }
  const s = comparaSolape(g, nc, opciones)
  if (s.recargar) return { accion: 'recargar', motivo: s.motivo, paraGuardar: [], combinadas: [], solape: s }
  if (s.insuficiente) return { accion: 'ampliar-solape', motivo: 'lo nuevo no cubre las últimas velas guardadas', paraGuardar: [], combinadas: g, solape: s }
  const porFecha = new Map(g.map(v => [v.date, v]))
  const paraGuardar = nc.filter(v => {
    const old = porFecha.get(v.date)
    if (!old) return true                         // vela nueva (o un hueco que ahora aparece)
    return CAMPOS.some(c => old[c] !== v[c]) || (old.volume ?? null) !== (v.volume ?? null)
  })
  return { accion: paraGuardar.length ? 'guardar' : 'nada', motivo: null, paraGuardar, combinadas: combinaVelas(g, nc), solape: s }
}

// ── Traducción a la base de datos ──────────────────────────────────────────────────────────────────
// Filas para guardar_velas: { fecha, open, high, low, close, volumen }.
export const aFilasBd = (velas) => (velas || []).map(v => ({ fecha: v.date, open: v.open, high: v.high, low: v.low,
  close: v.close, volumen: finito(v.volume) ? Math.round(v.volume) : null }))
// De lo que devuelve leer_velas ({ fecha: [], open: [], … }) a velas del motor.
export function deColumnasBd(c) {
  if (!c || !Array.isArray(c.fecha)) return []
  return c.fecha.map((f, i) => ({ date: f, open: c.open[i], high: c.high[i], low: c.low[i], close: c.close[i], volume: c.volumen?.[i] ?? 0 }))
}

export default { velasCerradas, esAnomala, combinaVelas, comparaSolape, decideActualizacion, aFilasBd, deColumnasBd }
