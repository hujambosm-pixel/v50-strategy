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
// §137 (pedido por Sergi el 12/11): esos avisos ya no van en una franja amarilla arriba: van en el tooltip del ⚠ de cada cifra
// (avisoCelda), y los impuestos y las comisiones llevan ⚠ también cuando solo cambian los impuestos o la comisión.
// «Crecimiento de 100 €»: cuánto valdrían 100 € metidos el primer día, sin aportaciones (el VL del plan × 100, y su último punto,
// tras la venta final: el mismo factor que «Año a año»). Así se comparan un plan que aporta cada mes y otro que no: (último / 100) =
// (1 + CAGR del plan)^años.
import { cifrasPlan, anioAnio, conCierre, ajustesDe, nombreAlternativa, planDe, textoComision, fechaCorta, numero, euros, pct } from './planPantalla'
import { fotoDelPlan } from './planesGuardados'
import { detallePlan } from './detallePlan'

export const MAX_COMPARAR = 4
export const REFS_COMPARAR = Object.freeze([{ id: 'QQQ', nombre: 'Buy&Hold QQQ' }, { id: 'SPY', nombre: 'Buy&Hold SPY' }])
// Lo que se recuerda en este navegador: { elegidos: [ids], refs: [ids], log: bool, plegado: bool } (plegado: §135, las tarjetas en una línea).
export const CLAVE_COMPARAR = 'builder_comparar'
export const pieza = (plan) => (plan?.piezas || []).find(x => x.tipo === 'estrategia') || null
// §169: los ids se comparan como TEXTO: los planes guardados tienen un número (4, 6, 7) y las copias sin guardar, un texto
// («v-12»). Cada id se devuelve tal como viene (un 4 sigue siendo 4).
export const mismoId = (x, y) => x != null && y != null && String(x) === String(y)

// ── §169: COPIAS SIN GUARDAR para «Comparar con otras estrategias» ──
// Una copia = el plan TAL COMO ESTÁ en pantalla (sus ajustes de ahora, con lo no guardado) con OTRA estrategia: solo cambia la
// estrategia; el dinero, el periodo, los valores, el reparto, las velas, los filtros, el ocioso, los impuestos y la comisión, iguales.
// id «v-<id de la estrategia>»; nombre «<plan> · con <estrategia>». No se guarda en la base ni se recuerda en el navegador.
export const PREFIJO_COPIA = 'v-'
export const esCopia = (id) => String(id).startsWith(PREFIJO_COPIA)
export const idCopia = (estrategiaId) => `${PREFIJO_COPIA}${estrategiaId}`
export function copiaConEstrategia(a, estrategia, nombrePlan) {
  if (!a || !estrategia) return null
  return { id: idCopia(estrategia.id), nombre: `${nombrePlan || 'Plan'} · con ${estrategia.name}`, plan: planDe(a, estrategia), copia: true }
}
// §170: el plan TAL COMO ESTÁ (con cambios sin guardar, o un plan nuevo): la base de la comparación cuando no coincide con lo guardado.
export const ID_AHORA = idCopia('ahora')
export const copiaDeAhora = (plan, nombrePlan) => plan ? { id: ID_AHORA, nombre: `${nombrePlan || 'Plan'} · tal como está`, plan, copia: true } : null
// §170: «Comparar con otras estrategias»: hasta 3 copias (con la base, 4 = MAX_COMPARAR).
export const MAX_COPIAS = MAX_COMPARAR - 1
// Lo que se compara al pulsar «Comparar (N)»: la base (el plan guardado si no tiene cambios; si no, «tal como está») y una copia por estrategia.
export function eleccionCopias({ idGuardado = null, hayCambios = false, ids = [] }) {
  const base = idGuardado != null && !hayCambios ? idGuardado : ID_AHORA
  return { copias: ids.slice(0, MAX_COPIAS).map(String), conAhora: base === ID_AHORA, elegidos: [base, ...ids.slice(0, MAX_COPIAS).map(idCopia)], vista: 'tabla' }   // §172: se entra en la vista «Tabla»
}
// §173: el nombre que se propone al guardar una copia como plan: «<plan> · <estrategia>»; el plan tal como está, «<plan> (copia)».
export const nombreParaGuardar = (copia, nombrePlan) => !copia ? '' : copia.id === ID_AHORA ? `${nombrePlan || 'Plan'} (copia)` : `${nombrePlan || 'Plan'} · ${fotoDelPlan(copia.plan)?.name || 'estrategia'}`
// §173: tras guardar una copia, en la comparación su sitio lo ocupa el plan guardado (mismo lugar y color) y la copia se olvida.
export function trasGuardarCopia(comp, idCopiaGuardada, idNuevo) {
  const elegidos = (comp.elegidos || []).map(x => mismoId(x, idCopiaGuardada) ? idNuevo : x)
  return idCopiaGuardada === ID_AHORA ? { ...comp, elegidos, conAhora: false } : { ...comp, elegidos, copias: (comp.copias || []).filter(id => idCopia(id) !== String(idCopiaGuardada)) }
}
// Las copias de una lista de ids de estrategia (las que ya no existen se saltan).
export const copiasDe = (a, estrategiaIds, estrategias, nombrePlan) =>
  (estrategiaIds || []).map(id => copiaConEstrategia(a, (estrategias || []).find(s => mismoId(s.id, id)), nombrePlan)).filter(Boolean)

// ── Las condiciones de cada plan ──
export function dineroDe(plan) {
  const d = plan?.dinero || {}, ap = d.aportaciones || {}, mes = ap.frecuencia === 'mensual' ? Number(ap.importe) || 0 : 0
  return { inicial: Number(d.capitalInicial) || 0, mes, sube: mes ? Number(ap.crecimientoAnual) || 0 : 0, extra: JSON.stringify(d.extraordinarias || []) }
}
const claveDinero = (plan) => JSON.stringify(dineroDe(plan))
const clavePeriodo = (plan) => `${plan?.periodo?.desde}|${plan?.periodo?.hasta}`
// §171: por lo que SIGNIFICAN (impuestos, % de comisión, mínimo por orden y horquilla > 0), no por cómo se guardaron: un plan guardado
// y su copia con los mismos costes escritos de otra forma (p. ej. sin la horquilla de SPY, a 0) no deben dar un ⚠ falso.
const claveCostes = (plan) => { const c = plan?.costes || {}
  return JSON.stringify([plan?.impuestos?.regimen || null, Number(c.comisionPct) || 0, Number(c.comisionMinEur) || 0, Object.entries(c.horquillaPct || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]).sort()]) }
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
  // §190: con varios bloques, «2 bloques: Cruce de medias 50/200 (60 %) + Sigue la tendencia (40 %) · ocioso oro (GLD)».
  const bs = (plan?.piezas || []).filter(p => p.tipo === 'estrategia' || p.tipo === 'pesos')   // §197: también los «Con pesos»
  if (bs.length > 1) return `${bs.length} bloques: ${bs.map(p => `${p.tipo === 'pesos' ? `con pesos ${(p.pesos || []).map(q => q.simbolo === 'LIQUIDEZ' ? 'liquidez' : q.simbolo).join('/')}${p.reglas?.length ? ` y ${p.reglas.length === 1 ? '1 regla' : `${p.reglas.length} reglas`}` : ''}` : p.estrategia?.name || 'estrategia'} (${String(Math.round((Number(p.peso) || 0) * 1000) / 10).replace('.', ',')} %)`).join(' + ')} · ocioso ${OCIOSO[x.ocioso] || x.ocioso}`
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
// §137: el tooltip del ⚠ de una cifra: los avisos que le tocan, cada uno en su párrafo; null si no le toca ninguno.
//   dinero (aportado, final, impuestos, comisiones): dinero y periodo; periodo (CAGR, TIR, caída): periodo; impuestos y comisiones,
//   además, costes. Los tramos, nunca.
export function avisoCelda(fila, dif) {
  const ids = fila.tipo === 'dinero' ? ['dinero', 'periodo'] : fila.tipo === 'periodo' ? ['periodo'] : []
  if (['impuestos', 'costes'].includes(fila.k)) ids.push('costes')
  const as = avisosComparar(dif).filter(a => ids.includes(a.id))
  return as.length ? as.map(a => `⚠ ${a.titulo} (${a.detalle}). ${a.que}`).join('\n\n') : null
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
// §137: el tooltip de la fila «CAGR Buy&Hold QQQ/SPY» de un plan: qué es, con qué dinero y periodo, cuánto tendrías y cómo salen los
// puntos (con tres decimales, para que la resta cuadre con calculadora). ref: { id, nombre }; b: cifrasComparacion(…).refs[id].
export function textoRef(ref, plan, b, twrPlan) {
  if (!b) return null
  const p3 = (x) => `${numero(x * 100, 3)} %`
  return `${ref.nombre} = comprar ${ref.id} el primer día${dineroDe(plan).mes ? ' y con cada aportación' : ''} y no vender hasta el último, con el MISMO dinero que este plan (${textoDinero(plan)}), `
    + `en su MISMO periodo (${textoPeriodo(plan)}) y con sus mismos impuestos y comisiones (vendiendo todo el último día). Lo que tendrías sin estrategia.\n\n`
    + `Acabarías con ${euros(b.final, 0)}. Su CAGR (cuánto crece cada euro al año, de media) es ${pct(b.twr)}; el de tu plan, ${pct(twrPlan)}.\n\n`
    + `Entre paréntesis, los puntos de CAGR que tu plan le saca (+, en verde) o le pierde (−, en rojo): ${p3(twrPlan)} − ${p3(b.twr)} = ${puntosFrente(twrPlan, b.twr)}.`
}

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

// ── §172 · VISTA «TABLA» (boceto bocetos/detalle-final.html, pestaña 3): una fila por plan, como la tabla de «La cartera por dentro» ──
// Todo sale de la pestaña «Detalle» de cada plan (detallePlan, con el libro que /api/plan trae siempre): nada se calcula aparte.
// tipo: como en las tarjetas ('dinero' → ⚠ si el dinero o el periodo no coinciden; 'periodo' → ⚠ si el periodo no coincide). mejor:
// la ★ a la mayor (la peor caída, la menos mala).
export const COLUMNAS_TABLA = Object.freeze([
  { k: 'operaciones', t: 'Operaciones' },
  { k: 'cagr', t: 'CAGR', tipo: 'periodo', mejor: true },
  { k: 'ganancia', t: 'Ganancia', tipo: 'dinero', mejor: true },
  { k: 'ganadoras', t: 'Ganadoras', mejor: true },
  { k: 'pf', t: 'Profit Factor', mejor: true },
  { k: 'caidaPct', t: 'Peor caída', tipo: 'periodo', mejor: true },
  { k: 'caidaEur', t: 'Peor caída €', tipo: 'dinero', mejor: true },
  { k: 'enValores', t: 'Dinero en valores' },
  { k: 'tiempo', t: 'Tiempo invertido' },
])
// La fila de un plan y las de sus valores. null si la respuesta no trae el libro.
//   Plan: CAGR del plan, ganancia (final − aportado), peor caída del plan (% y €), dinero en valores de media y tiempo con algo invertido.
//   Valor: CAGR de su aportación, lo que aportó, su peor caída (de lo ganado con él; «—» si nunca bajó), dinero en él y tiempo dentro.
export function filaTabla(respuesta, plan) {
  const d = detallePlan(respuesta, plan)
  if (!d) return null
  const c = d.cifras
  return { aportado: d.suma.aportado, unValor: d.unValor,
    cifras: { operaciones: c.operaciones, cagr: c.cagr, ganancia: c.ganancia, gananciaPct: c.gananciaPct, ganadoras: c.ganadoras, ganan: c.ganan, pf: c.pf, caidaPct: c.caidaPct, caidaEur: c.caidaEur, enValores: c.enValores, enValoresEur: c.enValoresEur, tiempo: c.tiempoInvertido },
    valores: d.filas.map(f => ({ simbolo: f.simbolo, operaciones: f.operaciones, cagr: f.cagr, ganancia: f.aporto, gananciaPct: f.aportoPct, ganadoras: f.ganadoras, ganan: f.ganan, pf: f.pf,
      caidaPct: f.caidaEur < 0 ? f.caidaPct : null, caidaEur: f.caidaEur < 0 ? f.caidaEur : null, enValores: f.enEl, enValoresEur: f.enElEur, tiempo: f.dentro })) }
}
// La fila «Buy&Hold» de abajo: el de los valores del plan (con una lista, a partes iguales), con las reglas del plan. Solo si TODOS los planes
// tienen los mismos valores, dinero, periodo y costes (si no, cada uno tendría el suyo y no se pone). items: [{ plan, respuesta, aportado }].
const claveValores = (plan) => { const x = pieza(plan); return x?.donde === 'lista' ? JSON.stringify([x.lista?.universo || 'manual', [...(x.lista?.simbolos || [])].sort()]) : JSON.stringify(x?.activo || null) }
export function bhTabla(items) {
  if (!items.length) return null
  const clave = (p) => [claveValores(p), claveDinero(p), clavePeriodo(p), claveCostes(p)].join('|')
  if (new Set(items.map(i => clave(i.plan))).size > 1) return null
  const { plan, respuesta, aportado } = items[0], r = respuesta?.evaluacion?.referencias?.find(x => x.id === 'ACTIVO'), m = r?.medidas
  if (!m || !(aportado > 0)) return null
  const x = pieza(plan), g = m.valorNeto - aportado
  return { nombre: nombreAlternativa('ACTIVO', x?.donde === 'lista' ? null : x?.activo, r.nombre), cagr: m.twrNeto, ganancia: g, gananciaPct: g / aportado, caidaPct: m.caida?.caida ?? null, caidaEur: m.caidaEuros?.euros ?? null, enValores: 1, tiempo: 1 }
}
// La mejor cifra de cada columna que se compara (con al menos dos números).
export function mejoresTabla(cifras, dif) {
  const out = {}
  COLUMNAS_TABLA.forEach(col => {
    if (!col.mejor || (col.tipo && !comparable(col, dif))) return
    const xs = cifras.map(c => c?.[col.k]).filter(Number.isFinite)
    if (xs.length > 1) out[col.k] = Math.max(...xs)
  })
  return out
}

// ── Lo que se recuerda ──
// Los elegidos al entrar: los recordados que siguen existiendo; si no queda ninguno, los guardados abiertos en pestañas; si no, los primeros.
export function elegidosIniciales(planes, recordados, abiertos) {
//   §169: ids como texto; se devuelve el id del plan tal como es (número o texto).
  const porTexto = new Map(planes.map(p => [String(p.id), p.id]))
  const de = (xs) => [...new Set((xs || []).map(String))].filter(id => porTexto.has(id)).map(id => porTexto.get(id)).slice(0, MAX_COMPARAR)
  const r = de(recordados)
  if (r.length) return r
  const a = de(abiertos)
  return a.length ? a : planes.slice(0, MAX_COMPARAR).map(p => p.id)
}
export const alterna = (elegidos, id) => elegidos.some(x => mismoId(x, id)) ? (elegidos.length > 1 ? elegidos.filter(x => !mismoId(x, id)) : elegidos) : elegidos.length < MAX_COMPARAR ? [...elegidos, id] : elegidos
// Lo que se recuerda en el navegador: sin las copias (no existen al volver).
export const paraRecordar = (elegidos) => (elegidos || []).filter(id => !esCopia(id))

// ── Textos ──
export const AYUDA_COMPARAR = {
  pantalla: 'Cada plan se calcula tal como lo guardaste: su dinero, su periodo, sus impuestos y su comisión (los cambios sin guardar de una pestaña no cuentan). '
    + 'Si dos planes no meten el mismo dinero, lo que depende del dinero (aportado, final, impuestos y comisiones) no se puede comparar: sale en gris con ⚠. Ejemplo: «Cruce de medias 50/200» mete 10.000 € de golpe y «Sigue la tendencia» mete 10.000 € + 119 × 300 € = 45.700 €; el segundo acaba con más dinero aunque su estrategia sea peor. '
    + 'Lo que sí se compara: el CAGR del plan (cuánto crece cada euro, sin contar cuándo entra), la TIR (la rentabilidad de tu dinero, con sus fechas; sin aportaciones es igual al CAGR) y la peor caída en %, siempre que el periodo sea el mismo. Si el periodo cambia, compara los tramos 2016–2020 y 2021–2025: son los mismos años para todos. '
    + 'La ★ marca la mejor cifra de cada fila, solo en las que se comparan. Puedes elegir hasta 4 planes.',
  refs: 'Comprar y mantener QQQ o SPY con el MISMO dinero y en el MISMO periodo de cada plan, con sus mismos impuestos y comisiones (lo que tendrías sin estrategia). En cada tarjeta, su CAGR y, entre paréntesis, los puntos de CAGR que tu plan les saca (verde) o les pierde (rojo). Ejemplo: tu plan 15,07 % y QQQ 18,30 % → 15,07 − 18,30 = (−3,23). Pasa el ratón por la fila para ver sus cuentas. Quita la marca para no verlos.',
  grafico: '«Crecimiento de 100 €»: cuánto valdrían 100 € metidos el primer día de cada plan, sin aportaciones; es el CAGR del plan en dibujo y sirve aunque los planes metan dinero distinto. Ejemplo: con un CAGR del 10 % durante 10 años, 100 € × 1,1^10 = 259 €. '
    + '«Tu dinero en €»: lo que tendrías de verdad, con tus aportaciones; las líneas solo se comparan si todos meten el mismo dinero en el mismo periodo. El último punto de cada línea, tras vender todo el último día.',
  anios: 'La rentabilidad de cada año (por tiempo, como el CAGR: las aportaciones no cuentan como ganancia; el último año incluye la venta final). En negrita, el mejor plan de cada año. «—»: ese plan no tiene ese año.',
}
export const TITULO_COPIA = 'Copia sin guardar: tu plan tal como está ahora en pantalla, cambiando solo la estrategia (el mismo dinero, periodo, valores, reparto, ocioso, impuestos y comisión). No se guarda en la base: si te convence, pulsa «Guardar como plan».'
export const AYUDA_COPIAS = 'Calcula tu plan tal como está ahora en pantalla (también lo que no hayas guardado) cambiando SOLO la estrategia: el mismo dinero, periodo, valores, reparto, ocioso, impuestos y comisión. Así ves qué estrategia aprovecha mejor tu plan. No se guarda nada. '
  + 'Ejemplo: tu plan con «Cruce de medias 50/200» mete 10.000 € y acaba en 25.000 € en 10 años (CAGR 9,6 %: 2,5^(1/10) = 1,096); la copia «· con Sigue la tendencia» acaba en 31.000 € (CAGR 12,0 %: 3,1^(1/10) = 1,120). Con el mismo dinero y los mismos costes, la segunda rinde 2,4 puntos más al año.'
export const AYUDA_TABLA = 'Una fila por plan, con las cifras de su pestaña «Detalle» (el mismo cálculo que «Tienes al final»: con tu dinero, el ocioso, los impuestos y las comisiones). Pulsa ▸ para ver sus valores. '
  + 'CAGR: lo que crece cada euro al año (en un valor, el de lo que aportó). Ganancia: lo que acabas teniendo menos lo aportado. Ganadoras: la parte de las operaciones que ganan. Profit Factor: lo ganado en las que ganan ÷ lo perdido en las que pierden (más de 1, gana). Peor caída: de pico a valle. Dinero en valores: de media, la parte de tu dinero metida en valores; tiempo invertido: la parte de los días con algo en valores. '
  + 'En las filas de cada VALOR, la ganancia es lo que aportó ese valor ANTES de comisiones e impuestos (como en «Detalle»): por eso sus ganancias no suman la del plan, que ya los descuenta. '
  + 'Ejemplo: 10.000 € que acaban en 48.500 € en 10 años: ganancia 48.500 − 10.000 = 38.500 €; CAGR 4,85^(1/10) − 1 = 17,1 %. Abajo, el Buy&Hold de los mismos valores con las reglas de tu plan (solo si todos los planes usan los mismos valores, dinero, periodo y costes).'
export const TEXTO_SIN_PLANES = 'Guarda al menos dos planes para compararlos.'
export const NOTA_EUROS_FUERA = '⚠ Estos planes no meten el mismo dinero o no tienen el mismo periodo: estas líneas no se comparan entre sí (mira «Crecimiento de 100 €»). QQQ y SPY no se dibujan aquí: cada plan tendría los suyos.'
export const notaCrecimiento = (calculados, dif) => calculados.length ? `Cada línea empieza en 100 € el primer día de su plan${dif.periodo ? '' : ' (por eso no empiezan todas el mismo día)'}.` : ''
export { pct, euros }
