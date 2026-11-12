// lib/builder/comparaPlanes.js — «COMPARAR PLANES» (docs/builder.md §128; boceto bocetos/comparar-planes.html, opción A elegida por
// Sergi el 11/11). Puro: no toca la red ni React. La pantalla es components/ComparaPlanes.js.
//
// OPCIÓN A: cada plan se calcula TAL COMO ESTÁ GUARDADO (su dinero, su periodo, sus impuestos y su comisión), con el mismo motor y la
// misma respuesta de /api/plan que su pestaña. Por eso no todo se puede comparar, y la pantalla lo dice donde engaña:
//   · dinero distinto (inicial, aportación o su subida) o periodo distinto → aportado, «Tienes al final», impuestos y comisiones NO
//     se comparan (⚠, sin ★);
//   · periodo distinto → tampoco el CAGR del plan, la TIR ni la peor caída (años distintos de mercado): sí los TRAMOS, que son los
//     mismos años para todos (y sale «—» en el plan que no cubre el tramo entero);
//   · impuestos o comisión distintos → solo un aviso (cada cifra ya es neta de los suyos; parte de la diferencia viene de ahí).
// «Crecimiento de 100 €»: cuánto valdrían 100 € metidos el primer día, sin aportaciones (el VL del plan × 100, y su último punto,
// tras la venta final: el mismo factor que «Año a año»). Así se comparan un plan que aporta cada mes y otro que no: (último / 100) =
// (1 + CAGR del plan)^años.
import { cifrasPlan, anioAnio, conCierre, ajustesDe, textoComision, fechaCorta, numero, euros, pct } from './planPantalla'
import { fotoDelPlan } from './planesGuardados'

export const MAX_COMPARAR = 4
export const REFS_COMPARAR = Object.freeze([{ id: 'QQQ', nombre: 'Buy&Hold QQQ' }, { id: 'SPY', nombre: 'Buy&Hold SPY' }])
// Lo que se recuerda en este navegador: { elegidos: [ids], refs: [ids], log: bool, plegado: bool } (plegado: §135, las tarjetas en una línea).
export const CLAVE_COMPARAR = 'builder_comparar'
export const pieza = (plan) => (plan?.piezas || []).find(x => x.tipo === 'estrategia') || null

// ── Las condiciones de cada plan ──
export function dineroDe(plan) {
  const d = plan?.dinero || {}, ap = d.aportaciones || {}, mes = ap.frecuencia === 'mensual' ? Number(ap.importe) || 0 : 0
  return { inicial: Number(d.capitalInicial) || 0, mes, sube: mes ? Number(ap.crecimientoAnual) || 0 : 0, extra: JSON.stringify(d.extraordinarias || []) }
}
const claveDinero = (plan) => JSON.stringify(dineroDe(plan))
const clavePeriodo = (plan) => `${plan?.periodo?.desde}|${plan?.periodo?.hasta}`
const claveCostes = (plan) => JSON.stringify([plan?.impuestos?.regimen || null, plan?.costes || null])
export function textoDinero(plan) {
  const d = dineroDe(plan)
  return `${euros(d.inicial, 0)}${d.mes ? ` + ${euros(d.mes, 0)}/mes${d.sube ? ` (sube un ${numero(d.sube, 0)} % al año)` : ''}` : ', sin aportaciones'}`
}
// «2016–2025» si son años enteros; si no, las dos fechas.
export function textoPeriodo(plan) {
  const { desde = '', hasta = '' } = plan?.periodo || {}
  return desde.slice(5) === '01-01' && hasta.slice(5) === '12-31' ? `${desde.slice(0, 4)}–${hasta.slice(0, 4)}` : `${fechaCorta(desde)}–${fechaCorta(hasta)}`
}
export const textoCostes = (plan) => `${plan?.impuestos?.regimen === 'ES-ahorro' ? 'impuestos de España' : 'sin impuestos'} · ${textoComision(ajustesDe(plan))}`
const OCIOSO = { LIQUIDEZ: 'liquidez', GLD: 'oro (GLD)' }
// «Copia editor 23 · una acción, AAPL · ocioso oro (GLD)» / «… · una lista de 12 valores · …» / «… · Nasdaq-100 (ndx_vol_10) · …».
export function textoBloque(plan) {
  const x = pieza(plan)
  if (!x) return ''
  const est = fotoDelPlan(plan)?.name || 'estrategia'
  const donde = x.donde === 'lista' ? (x.lista?.universo && x.lista.universo !== 'manual' ? `Nasdaq-100 (${x.lista.universo})` : `una lista de ${(x.lista?.simbolos || []).length} valores`) : `una acción, ${x.activo}`
  return `${est} · ${donde} · ocioso ${OCIOSO[x.ocioso] || x.ocioso}`
}

// ── Qué no coincide entre los planes elegidos ──
// planes: [{ id, nombre, plan }]. Devuelve { dinero, periodo, costes } (true = todos iguales) y, para el aviso, los grupos
// [[texto, [nombres]]] de lo que no coincide.
export function diferencias(planes) {
  const grupos = (clave, texto) => { const m = new Map(); planes.forEach(p => { const k = clave(p.plan); if (!m.has(k)) m.set(k, [texto(p.plan), []]); m.get(k)[1].push(p.nombre) }); return [...m.values()] }
  const gD = grupos(claveDinero, textoDinero), gP = grupos(clavePeriodo, textoPeriodo), gC = grupos(claveCostes, textoCostes)
  return { dinero: gD.length <= 1, periodo: gP.length <= 1, costes: gC.length <= 1, grupos: { dinero: gD, periodo: gP, costes: gC } }
}
const lista = (gs) => gs.map(([t, ns]) => `${ns.map(n => `«${n}»`).join(', ')}: ${t}`).join(' · ')
// Los avisos de arriba, uno por cosa que no coincide (vacío si todo coincide).
export function avisosComparar(dif) {
  const out = []
  if (!dif.dinero) out.push({ id: 'dinero', titulo: 'No meten el mismo dinero', detalle: lista(dif.grupos.dinero), que: 'Aportado, «Tienes al final», impuestos y comisiones no se comparan (⚠). Compara el CAGR del plan, la TIR y la peor caída.' })
  if (!dif.periodo) out.push({ id: 'periodo', titulo: 'No tienen el mismo periodo', detalle: lista(dif.grupos.periodo), que: 'Con años distintos de mercado, el CAGR del plan, la TIR y la peor caída tampoco se comparan (⚠): compara los tramos, que son los mismos años para todos.' })
  if (!dif.costes) out.push({ id: 'costes', titulo: 'No tienen los mismos impuestos o comisiones', detalle: lista(dif.grupos.costes), que: 'Cada cifra ya descuenta los suyos: parte de la diferencia entre planes viene de ahí.' })
  return out
}

// ── Las filas de cada tarjeta ──
// tipo: 'dinero' (depende del dinero y del periodo), 'periodo' (depende del periodo), 'tramo' (siempre se compara). mejor: la ★ al mayor.
export const FILAS_COMPARAR = Object.freeze([
  { k: 'aportado', t: 'Aportado', tipo: 'dinero', mejor: false },
  { k: 'final', t: 'Tienes al final', tipo: 'dinero', mejor: true },
  { k: 'twr', t: 'CAGR del plan', tipo: 'periodo', mejor: true },
  { k: 'tir', t: 'Rentabilidad de tu dinero (TIR)', tipo: 'periodo', mejor: true },
  { k: 'caida', t: 'Peor caída', tipo: 'periodo', mejor: true },
  { k: 'impuestos', t: 'Impuestos', tipo: 'dinero', mejor: false },
  { k: 'costes', t: 'Comisiones', tipo: 'dinero', mejor: false },
  { k: 't1', t: 'CAGR 2016–2020', tipo: 'tramo', mejor: true },
  { k: 't2', t: 'CAGR 2021–2025', tipo: 'tramo', mejor: true },
])
export const comparable = (fila, dif) => fila.tipo === 'tramo' || (fila.tipo === 'periodo' ? dif.periodo : dif.dinero && dif.periodo)
export const MOTIVO_NO_COMPARABLE = {
  dinero: 'No se compara: estos planes no meten el mismo dinero o no tienen el mismo periodo.',
  periodo: 'No se compara: estos planes no tienen el mismo periodo (años distintos de mercado). Compara los tramos.',
}
// La mejor cifra de cada fila que se compara (con al menos dos números): { k: valor }. La peor caída: la menos mala (la mayor).
export function mejores(valores, dif) {
  const out = {}
  FILAS_COMPARAR.forEach(f => {
    if (!f.mejor || !comparable(f, dif)) return
    const xs = valores.map(v => v?.[f.k]).filter(Number.isFinite)
    if (xs.length > 1) out[f.k] = Math.max(...xs)
  })
  return out
}

// ── Las cifras de un plan para la comparación (la respuesta de /api/plan con curvas, la misma de su pestaña) ──
const ultimo = (s) => s?.[s.length - 1]
const netoDe = (neto, patrimonio) => patrimonio > 0 && Number.isFinite(neto) ? neto / patrimonio : 1
// 100 € el primer día: el VL × 100, con el último punto tras la venta final (neto / patrimonio de ese día).
export const crecimiento = (vl, neto, patrimonio) => vl?.length ? conCierre(vl.map(v => 100 * v), 100 * ultimo(vl) * netoDe(neto, ultimo(patrimonio))) : null
export function cifrasComparacion(respuesta, plan) {
  const c = cifrasPlan(respuesta, plan)
  const ev = respuesta.evaluacion, m = ev.plan.medidas, ej = ev.plan.ejecucion, curvas = respuesta.curvas || {}
  const refs = Object.fromEntries(ev.referencias.map(r => [r.id, r]))
  const fechas = c.curva.fechas, patr = ej.serie.map(p => p.patrimonio)
  const fila = (id) => c.alternativas.find(x => x.id === id) || null
  const ref = (id) => {
    const f = fila(id), cu = curvas[id]
    if (!f) return null
    const neto = netoDe(refs[id]?.medidas.valorNeto, ultimo(cu?.patrimonio))
    return { twr: f.twr, final: f.final, tir: f.tir, euros: c.curva[id.toLowerCase()] || null, crec: cu?.vl ? crecimiento(cu.vl, refs[id]?.medidas.valorNeto, cu.patrimonio) : null,
      anios: cu?.vl ? anioAnio({ fechas, vl: cu.vl, netoPlan: neto }).map(x => ({ anio: x.anio, r: x.plan })) : [] }
  }
  return {
    valores: { aportado: c.seis.aportado, final: c.seis.final, twr: c.seis.twr, tir: c.seis.tir, caida: c.seis.caidaPct, impuestos: c.seis.impuestos, costes: c.seis.costes, t1: c.tramos[0]?.cagr ?? null, t2: c.tramos[1]?.cagr ?? null },
    ordenes: c.ordenes, desde: m.desde, hasta: m.hasta,
    fechas, euros: c.curva.plan, crec: crecimiento(ej.serie.map(p => p.vl), m.valorNeto, patr),
    anios: c.anios.map(x => ({ anio: x.anio, r: x.plan })),
    refs: Object.fromEntries(REFS_COMPARAR.map(r => [r.id, ref(r.id)])),
  }
}
// Los puntos que el plan saca (o pierde) frente a una referencia, en CAGR: «+2,35» / «−1,10».
export const puntosFrente = (twr, twrRef) => Number.isFinite(twr) && Number.isFinite(twrRef) ? `${twr >= twrRef ? '+' : '−'}${numero(Math.abs(twr - twrRef) * 100, 2)}` : '—'

// ── El gráfico ──
// modo: 'crec' o 'eur'. Por defecto (null), «Tu dinero en €» solo si todos meten el mismo dinero en el mismo periodo.
export const modoGrafico = (modo, dif) => modo || (dif.dinero && dif.periodo ? 'eur' : 'crec')
// Las líneas: una por plan y, si toca, QQQ y SPY. En «crec», las referencias salen del plan que empieza antes (el primero elegido si
// empatan); en «eur», solo si todos meten el mismo dinero en el mismo periodo (si no, cada plan tendría las suyas).
// calculados: [{ id, nombre, color, c }] (c = cifrasComparacion). Devuelve { lineas: [{ id, nombre, color, fechas, v, ref }], refsFuera }.
export function lineasGrafico(calculados, { modo, dif, refs = [] }) {
  const lineas = calculados.map(p => ({ id: p.id, nombre: p.nombre, color: p.color, fechas: p.c.fechas, v: modo === 'crec' ? p.c.crec : p.c.euros, ref: false }))
  const conRefs = modo === 'crec' || (dif.dinero && dif.periodo)
  if (calculados.length && conRefs) {
    const base = [...calculados].sort((a, b) => String(a.c.fechas[0]).localeCompare(String(b.c.fechas[0])))[0]
    refs.forEach(r => { const x = base.c.refs[r.id], v = x && (modo === 'crec' ? x.crec : x.euros); if (v?.length) lineas.push({ id: r.id, nombre: r.nombre, color: r.color, fechas: base.c.fechas, v, ref: true }) })
  }
  return { lineas, refsFuera: !conRefs && refs.length > 0 }
}

// ── «Año a año» ──
// Las filas: todos los años de los planes; cada columna, su rentabilidad del año o null. Las referencias, del plan que empieza antes.
export function tablaAnios(calculados, refs = []) {
  const anios = [...new Set(calculados.flatMap(p => p.c.anios.map(x => x.anio)))].sort()
  const base = [...calculados].sort((a, b) => String(a.c.fechas[0]).localeCompare(String(b.c.fechas[0])))[0]
  const cols = [...calculados.map(p => ({ id: p.id, nombre: p.nombre, color: p.color, ref: false, m: new Map(p.c.anios.map(x => [x.anio, x.r])) })),
    ...(base ? refs.map(r => ({ id: r.id, nombre: r.nombre, color: r.color, ref: true, m: new Map((base.c.refs[r.id]?.anios || []).map(x => [x.anio, x.r])) })) : [])]
  return { cols, filas: anios.map(a => ({ anio: a, valores: cols.map(c => c.m.has(a) ? c.m.get(a) : null) })) }
}

// ── Lo que se recuerda ──
// Los elegidos al entrar: los recordados que siguen existiendo; si no queda ninguno, los guardados abiertos en pestañas; si no, los primeros.
export function elegidosIniciales(planes, recordados, abiertos) {
  const hay = new Set(planes.map(p => Number(p.id)))
  const de = (xs) => [...new Set((xs || []).map(Number))].filter(id => hay.has(id)).slice(0, MAX_COMPARAR)
  const r = de(recordados)
  if (r.length) return r
  const a = de(abiertos)
  return a.length ? a : planes.slice(0, MAX_COMPARAR).map(p => Number(p.id))
}
export const alterna = (elegidos, id) => elegidos.includes(id) ? (elegidos.length > 1 ? elegidos.filter(x => x !== id) : elegidos) : elegidos.length < MAX_COMPARAR ? [...elegidos, id] : elegidos

// ── Textos ──
export const AYUDA_COMPARAR = {
  pantalla: 'Cada plan se calcula tal como lo guardaste: su dinero, su periodo, sus impuestos y su comisión (los cambios sin guardar de una pestaña no cuentan). '
    + 'Si dos planes no meten el mismo dinero, lo que depende del dinero (aportado, final, impuestos y comisiones) no se puede comparar: sale en gris con ⚠. Ejemplo: «Cruce de medias 50/200» mete 10.000 € de golpe y «Sigue la tendencia» mete 10.000 € + 119 × 300 € = 45.700 €; el segundo acaba con más dinero aunque su estrategia sea peor. '
    + 'Lo que sí se compara: el CAGR del plan (cuánto crece cada euro, sin contar cuándo entra), la TIR (la rentabilidad de tu dinero, con sus fechas; sin aportaciones es igual al CAGR) y la peor caída en %, siempre que el periodo sea el mismo. Si el periodo cambia, compara los tramos 2016–2020 y 2021–2025: son los mismos años para todos. '
    + 'La ★ marca la mejor cifra de cada fila, solo en las que se comparan. Puedes elegir hasta 4 planes.',
  refs: 'Comprar y mantener QQQ o SPY con el MISMO dinero y en el MISMO periodo de cada plan (lo que tendrías sin estrategia). En cada tarjeta, su CAGR y, entre paréntesis, los puntos que tu plan les saca (verde) o les pierde (rojo). Ejemplo: tu plan 15,07 % y QQQ 18,30 % → (−3,23). Quita la marca para no verlos.',
  grafico: '«Crecimiento de 100 €»: cuánto valdrían 100 € metidos el primer día de cada plan, sin aportaciones; es el CAGR del plan en dibujo y sirve aunque los planes metan dinero distinto. Ejemplo: con un CAGR del 10 % durante 10 años, 100 € × 1,1^10 = 259 €. '
    + '«Tu dinero en €»: lo que tendrías de verdad, con tus aportaciones; las líneas solo se comparan si todos meten el mismo dinero en el mismo periodo. El último punto de cada línea, tras vender todo el último día.',
  anios: 'La rentabilidad de cada año (por tiempo, como el CAGR: las aportaciones no cuentan como ganancia; el último año incluye la venta final). En negrita, el mejor plan de cada año. «—»: ese plan no tiene ese año.',
}
export const TEXTO_SIN_PLANES = 'Guarda al menos dos planes para compararlos.'
export const NOTA_EUROS_FUERA = '⚠ Estos planes no meten el mismo dinero o no tienen el mismo periodo: estas líneas no se comparan entre sí (mira «Crecimiento de 100 €»). QQQ y SPY no se dibujan aquí: cada plan tendría los suyos.'
export const notaCrecimiento = (calculados, dif) => calculados.length ? `Cada línea empieza en 100 € el primer día de su plan${dif.periodo ? '' : ' (por eso no empiezan todas el mismo día)'}.` : ''
export { pct, euros }
