// lib/builder/detallePlan.js — la pestaña «Detalle» del plan (docs/builder.md §156; parte 2 de «un solo cálculo»). Puro.
// Con el LIBRO del motor (lib/planes/plan.js, opción `libro`; llega en la respuesta de /api/plan con libro: true) prepara lo que pinta
// components/PlanDetalle.js. No calcula nada del plan: solo ordena y resume lo que el motor ya apuntó. Sin libro, null.
//   · cabecera: cuántos valores (y cuántos con operaciones), velas, las fechas reales de la serie, operaciones y órdenes (con su reparto);
//   · suma: aportado + ganado en los valores + ganado en el ocioso − comisiones − impuestos = «Tienes al final» (el puente del libro);
//   · filas: una por valor con operaciones ({ simbolo, aporto, operaciones, ganadoras, pf, dentro }), de más a menos aportado;
//       aporto = lo ganado con ese valor en euros, antes de comisiones e impuestos (porSimbolo.ganado: la suma de las filas es el total);
//       ganadoras = parte de sus operaciones con resultado > 0; pf = lo ganado en las que ganan / lo perdido en las que pierden
//       (null sin pérdidas); dentro = parte de los días del plan que acaba con ese valor en cartera;
//   · total: lo mismo con todas las operaciones; enValores = de media, la parte del dinero en valores al cierre;
//   · ocioso: { simbolos, aporto, ordenes, media (parte del dinero en el ocioso, de media), liquidez (ídem en liquidez) };
//   · curvas: { fechas, series: [{ simbolo, rol, v }] }: lo ganado con cada valor (y con el ocioso) hasta cada día;
//   · §157: mensuales (ganancias de cada mes y año), donde (dónde está el dinero cada día) y porOperacion (resultados por operación).
import { fraseRegla, textoPesos, nombreSimbolo } from './reglasPesos'
const ORDEN = ['compra', 'venta', 'ventaFinal']
const resumenOps = (ops) => {
  let gana = 0, pierde = 0, n = 0
  for (const o of ops) { if (o.resultado > 0) { gana += o.resultado; n++ } else if (o.resultado < 0) pierde -= o.resultado }
  return { operaciones: ops.length, ganan: n, ganadoras: ops.length ? n / ops.length : null, pf: pierde > 0 ? gana / pierde : null }
}
export function detallePlan(respuesta, plan) {
  const ev = respuesta?.evaluacion?.plan, ej = ev?.ejecucion, L = ej?.libro
  if (!L || !ej.serie?.length) return null
  const P = (plan?.piezas || []).find(x => x.tipo === 'estrategia') || {}, est = ej.estrategias?.[P.id] || {}
  const fechas = ej.serie.map(p => p.date), n = fechas.length, idx = new Map(fechas.map((f, i) => [f, i]))
  // §188: con varios bloques, los valores de todos (sin repetir).
  // §197: los bloques «Con pesos» también (sus símbolos, su parte del dinero cada día en ej.bloquesPesos y su resumen como nombre).
  const ests = (plan?.piezas || []).filter(x => x.tipo === 'estrategia' || x.tipo === 'pesos'), multi = !!L.porBloque && ests.length > 1
  // §280: los símbolos de un bloque «Con pesos»: los de partida y los que traen sus reglas (p. ej. QQQ y TQQQ al caer el SPY).
  const simsPesos = (x) => [...new Set([...(x.pesos || []).map(p => p.simbolo), ...(x.reglas || []).flatMap(r => { const a = r?.accion || {}; return a.tipo === 'pesos' ? (a.pesos || []).map(p => p.simbolo) : [a.de, a.a] })])].filter(z => z && z !== 'LIQUIDEZ')
  const infoDe = (x) => x.tipo === 'pesos' ? { lista: true, simbolos: simsPesos(x), dentro: ej.bloquesPesos?.[x.id]?.dentro || [] } : ej.estrategias?.[x.id] || {}
  const simsDe = (e) => e.lista ? (e.simbolos || []) : e.simbolo ? [e.simbolo] : []
  const soloPesos = ests.length === 1 && ests[0].tipo === 'pesos'   // §279: un plan solo «Con pesos»: sus símbolos, como una lista
  const deLaLista = multi ? [...new Set(ests.flatMap(x => simsDe(infoDe(x))))] : simsDe(soloPesos ? infoDe(ests[0]) : est)
  const numDe = multi ? new Map(ests.map((x, k) => [x.id, k + 1])) : null
  const porValor = new Map()
  for (const o of L.operaciones) { if (!porValor.has(o.simbolo)) porValor.set(o.simbolo, []); porValor.get(o.simbolo).push(o) }
  // Los días que acaban con el valor en cartera: desde el día de la compra hasta la víspera de la venta (o hasta el último, si sigue abierta).
  const diasDentro = (ops) => {
    const d = new Uint8Array(n)
    for (const o of ops) { const i = idx.get(o.entryDate), j = idx.get(o.exitDate); if (i == null || j == null) continue; for (let k = i; k < (o.abierta ? j + 1 : j); k++) d[k] = 1 }
    let s = 0; for (let k = 0; k < n; k++) s += d[k]
    return n ? s / n : null
  }
  // §162: como en el Backtesting. Base = lo que pusiste (sin aportaciones, tu dinero inicial); años = los del plan.
  const base = L.puente.aportado, anios = Math.max(1e-9, (Date.parse(fechas[n - 1] + 'T00:00:00Z') - Date.parse(fechas[0] + 'T00:00:00Z')) / (365.25 * 864e5))
  const cagrDe = (g) => base > 0 && base + g > 0 ? Math.pow((base + g) / base, 1 / anios) - 1 : null
  const pat = ej.serie.map(p => p.patrimonio)
  const enElDe = (v) => { if (!v?.length) return { pct: null, eur: null }; let s = 0, e = 0, m = 0; v.forEach((x, i) => { e += x; if (pat[i] > 0) { s += x / pat[i]; m++ } }); return { pct: m ? s / m : null, eur: e / v.length } }
  const filas = Object.entries(L.porSimbolo).filter(([, S]) => S.rol === 'valor').map(([simbolo, S]) => {
    const ops = porValor.get(simbolo) || [], en = enElDe(L.enValor?.[simbolo]), cd = caidaDeCurva(L.curvas?.[simbolo], ej.serie)
    return { simbolo, aporto: S.ganado, aportoPct: base > 0 ? S.ganado / base : null, cagr: cagrDe(S.ganado), ...resumenOps(ops), dentro: diasDentro(ops), enEl: en.pct, enElEur: en.eur, caidaEur: cd.eur, caidaPct: cd.pct }
  }).sort((a, b) => b.aporto - a.aporto || (a.simbolo < b.simbolo ? -1 : 1))
  const media = (k) => { let s = 0, m = 0; L.reparto.forEach((d, i) => { const pat = ej.serie[i].patrimonio; if (pat > 0) { s += d[k] / pat; m++ } }); return m ? s / m : null }
  const mov = (rol) => L.movimientos.filter(m => ORDEN.includes(m.tipo) && m.rol === rol).length
  const pu = L.puente, simOcioso = Object.entries(L.porSimbolo).filter(([, S]) => S.rol === 'ocioso').map(([a]) => a)
  const ordenes = ej.costes?.ordenes ?? null, deValores = mov('valor'), delOcioso = mov('ocioso')
  // §188 · VARIOS BLOQUES: una fila por bloque (en el orden del plan: 1, 2…) con lo suyo y, dentro, sus valores. Lo ganado por el bloque es
  // el del motor (porBloque.ganado, antes de comisiones e impuestos: los bloques suman «ganado en los valores»); sus valores, la suma de sus
  // operaciones. «Dinero en él» del bloque = la media de su parte del dinero cada día (estrategias[id].dentro); el de un valor solo si ese
  // valor no está en otro bloque (si está en dos, el motor lo lleva junto: «—»).
  const enCuantos = new Map()
  if (multi) for (const x of ests) for (const s of new Set(L.operaciones.filter(o => o.pieza === x.id).map(o => o.simbolo))) enCuantos.set(s, (enCuantos.get(s) || 0) + 1)
  const bloques = !multi ? null : ests.map((x, k) => {
    const B = L.porBloque[x.id] || { ganado: 0 }, e = infoDe(x), ops = L.operaciones.filter(o => o.pieza === x.id)
    const dentro = (e.dentro || []).slice(0, n), cd = caidaDeCurva(L.curvasBloque?.[x.id], ej.serie)
    let s = 0, eur = 0, dias = 0; dentro.forEach((f, i) => { s += f; eur += f * (pat[i] || 0); if (f > 1e-9) dias++ })
    const porSim = new Map(); for (const o of ops) { if (!porSim.has(o.simbolo)) porSim.set(o.simbolo, []); porSim.get(o.simbolo).push(o) }
    const valores = [...porSim.entries()].map(([simbolo, os]) => {
      const g = os.reduce((t, o) => t + o.resultado, 0), solo = enCuantos.get(simbolo) === 1, en = solo ? enElDe(L.enValor?.[simbolo]) : { pct: null, eur: null }, c2 = solo ? caidaDeCurva(L.curvas?.[simbolo], ej.serie) : { eur: null, pct: null }
      return { simbolo, aporto: g, aportoPct: base > 0 ? g / base : null, cagr: cagrDe(g), ...resumenOps(os), dentro: diasDentro(os), enEl: en.pct, enElEur: en.eur, caidaEur: c2.eur, caidaPct: c2.pct, compartido: !solo }
    }).sort((a, b) => b.aporto - a.aporto || (a.simbolo < b.simbolo ? -1 : 1))
    const sims = simsDe(e)
    return { id: x.id, n: k + 1, nombre: x.tipo === 'pesos' ? `Buy&Hold · ${(x.pesos || []).map(p => `${Math.round(p.peso * 1000) / 10} % ${p.simbolo === 'LIQUIDEZ' ? 'liquidez' : p.simbolo}`.replace('.', ',')).join(' + ')}` : x.estrategia?.name || x.estrategia?.nombre || '—', donde: x.tipo === 'pesos' ? sims.join(', ') || '—' : e.lista ? `${numeroEs(sims.length)} valores` : (e.simbolo || sims[0] || '—'), velas: x.velas === 'semanales' ? 'semanales' : 'diarias',
      peso: x.peso, aporto: B.ganado, aportoPct: base > 0 ? B.ganado / base : null, cagr: cagrDe(B.ganado), ...resumenOps(ops), caidaEur: cd.eur, caidaPct: cd.pct,
      enEl: dentro.length ? s / dentro.length : null, enElEur: dentro.length ? eur / dentro.length : null, dentro: dentro.length ? dias / dentro.length : null, valores }
  })
  return {
    // §161: con un solo valor (plan sin lista), su símbolo; la pantalla enseña sus velas directamente. §188: con varios bloques, nunca.
    unValor: !multi && !est.lista && !soloPesos, simbolo: multi || est.lista || soloPesos ? null : (est.simbolo || filas[0]?.simbolo || null),
    bloques,
    cabecera: { bloques: multi ? ests.length : null, valores: deLaLista.length || filas.length, conOperaciones: filas.filter(f => f.operaciones > 0).length, velas: P.velas === 'semanales' ? 'semanales' : 'diarias', desde: fechas[0], hasta: fechas[n - 1],
      operaciones: L.operaciones.length, ordenes, ordenesValores: deValores, ordenesOcioso: delOcioso, ordenesOtras: ordenes != null ? ordenes - deValores - delOcioso : 0 },
    suma: { aportado: pu.aportado, valores: pu.ganadoValores, ocioso: pu.ganadoOcioso, otros: pu.ganadoOtros, costes: pu.costes, impuestos: pu.impuestos, final: pu.valorNeto, descuadre: pu.descuadre,
      cuadra: Math.abs(pu.descuadre) < 0.005 && Math.abs(pu.valorNeto - (ev.medidas?.valorNeto ?? pu.valorNeto)) < 0.005 },
    // §167: la peor caída de lo ganado con TODOS los valores juntos (la suma de sus curvas), como el Max DD de la fila de la estrategia.
    filas, total: { ...(() => { const cs = filas.map(f => L.curvas?.[f.simbolo]).filter(c => c?.length === n); if (!cs.length) return { caidaEur: null, caidaPct: null }; const s = cs[0].map((_, i) => cs.reduce((x, c) => x + c[i], 0)); const cd = caidaDeCurva(s, ej.serie); return { caidaEur: cd.eur, caidaPct: cd.pct } })(), aporto: pu.ganadoValores, aportoPct: base > 0 ? pu.ganadoValores / base : null, cagr: cagrDe(pu.ganadoValores), ...resumenOps(L.operaciones), enValores: media('valores'), enValoresEur: L.reparto.length ? L.reparto.reduce((s, d) => s + d.valores, 0) / L.reparto.length : null },
    // §162: las cifras de arriba de «Detalle» (las de la tabla del Backtesting que más se miran), del mismo cálculo.
    cifras: { cagr: ev.medidas?.twrNeto ?? null, ganancia: pu.valorNeto - pu.aportado, gananciaPct: base > 0 ? (pu.valorNeto - pu.aportado) / base : null, caidaPct: ev.medidas?.caida?.caida ?? null, caidaEur: ev.medidas?.caidaEuros?.euros ?? null,
      operaciones: L.operaciones.length, ...(({ ganan, ganadoras, pf }) => ({ ganan, ganadoras, pf }))(resumenOps(L.operaciones)), enValores: media('valores'), enValoresEur: L.reparto.length ? L.reparto.reduce((s, d) => s + d.valores, 0) / L.reparto.length : null,
      tiempoInvertido: L.reparto.length ? L.reparto.filter(d => d.valores > 1e-9).length / L.reparto.length : null, dias: L.reparto.length },
    // §191: también su «CAGR de su aportación» (la misma cuenta que un valor o un bloque), su peor caída (de lo ganado con él, día a día) y la
    // parte de los días con algo en el ocioso. Sin ganadoras ni Profit Factor: entra y sale a trozos cuando los bloques sueltan o piden dinero.
    ocioso: { simbolos: simOcioso, simbolo: P.ocioso || 'LIQUIDEZ', aporto: pu.ganadoOcioso, ordenes: delOcioso, media: media('ocioso'), liquidez: media('liquidez'), cagr: cagrDe(pu.ganadoOcioso),
      ...(() => { const cs = simOcioso.map(a => L.curvas?.[a]).filter(c => c?.length === n); if (!cs.length) return { caidaEur: null, caidaPct: null }; const cd = caidaDeCurva(cs[0].map((_, i) => cs.reduce((x, c) => x + c[i], 0)), ej.serie); return { caidaEur: cd.eur, caidaPct: cd.pct } })(),
      dentro: L.reparto.length ? L.reparto.filter(d => d.ocioso > 1e-9).length / L.reparto.length : null },
    // §157 (parte 3a)
    mensuales: mensuales(ej.serie, ev.medidas?.valorNeto ?? pu.valorNeto), donde: dondeEsta(ej.serie, L.reparto, bloques ? bloques.map(b => ({ n: b.n, dias: infoDe(ests.find(x => x.id === b.id) || {}).dentro || [] })) : null), porOperacion: porOperacion(L.operaciones, numDe),
    movimientos: movimientos(L, ej.serie, P.ocioso || 'LIQUIDEZ', numDe),   // §159
    senales: resumenSenales(L.senales),   // §163
    curvas: { fechas, series: [...filas.map(f => ({ simbolo: f.simbolo, rol: 'valor', v: L.curvas?.[f.simbolo] || [] })), ...simOcioso.map(a => ({ simbolo: a, rol: 'ocioso', v: L.curvas?.[a] || [] }))].filter(s => s.v.length === n) },
    // §188: «Bloque a bloque»: lo ganado con cada bloque (y con el ocioso) hasta cada día. bloque = su número (la pantalla le pone su color).
    reglas: reglasDeBloques(ej, ests, fechas),   // §200
    ociosoRegla: franjaOciosoRegla(ej, L.reparto, fechas),   // §204
    curvasBloques: !bloques ? null : { fechas, series: [...bloques.map(b => ({ simbolo: `Parte ${b.n}`, bloque: b.n, rol: 'valor', v: L.curvasBloque?.[b.id] || [] })), ...simOcioso.map(a => ({ simbolo: a, rol: 'ocioso', v: L.curvas?.[a] || [] }))].filter(s => s.v.length === n) },
  }
}
const numeroEs = (x) => Math.round(x).toLocaleString('es-ES')
// §200 · LAS REGLAS DE CADA BLOQUE «CON PESOS» (las apunta el motor en ej.pesos[id]: historial y, por día, la regla en curso; 0 = ninguna).
// Para cada bloque con reglas: { id, n (su número de bloque), reglas: [{ n, frase }], tramos: [{ estado, desde, hasta, dias }] (días
// seguidos con el mismo estado), tiempo: [{ estado, parte }] (parte de los días con cada estado; estado 0 primero), filas } con una
// fila por vez que actuó: { cumple, actua, regla, vuelta (true = acabó la regla y volvió a los pesos de partida), que, movido, pesos }.
const QUE_REGLA = (a) => a?.tipo === 'pesos' ? `Pasa a ${textoPesos(a.pesos)}`
  : a?.tipo === 'moverBloque' ? `Mueve el ${String(a.pct).replace('.', ',')} % de la parte de ${nombreSimbolo(a.de)} a ${nombreSimbolo(a.a)}`
  : a?.tipo === 'moverActivo' ? `Mueve el ${String(a.pct).replace('.', ',')} % de ${nombreSimbolo(a.de)} a ${nombreSimbolo(a.a)}`
  : a?.tipo === 'vender' ? `Vende ${nombreSimbolo(a.de)}` : '—'
const textoFracciones = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([sim, f]) => `${(Math.round(f * 1000) / 10).toString().replace('.', ',')} % ${nombreSimbolo(sim)}`).join(' + ') || '—'
export function reglasDeBloques(ej, ests, fechas) {
  const out = []
  ests.forEach((x, k) => {
    const R = x.tipo === 'pesos' && x.reglas?.length ? ej.pesos?.[x.id] : null
    if (!R) return
    const es = (R.estados || []).slice(0, fechas.length), tramos = []
    es.forEach((e, i) => { const t = tramos[tramos.length - 1]; if (t && t.estado === e) { t.hasta = fechas[i]; t.dias++ } else tramos.push({ estado: e, desde: fechas[i], hasta: fechas[i], dias: 1 }) })
    const cuenta = new Map(); for (const e of es) cuenta.set(e, (cuenta.get(e) || 0) + 1)
    const tiempo = [0, ...x.reglas.map((_, j) => j + 1)].map(e => ({ estado: e, parte: es.length ? (cuenta.get(e) || 0) / es.length : null }))
    const filas = (R.historial || []).map(h => ({ cumple: h.cumple, actua: h.actua, regla: h.regla, vuelta: h.que === 'partida',
      que: h.que === 'partida' ? `Acaba la regla ${h.regla}: vuelve a los pesos de partida` : QUE_REGLA(x.reglas[h.regla - 1]?.accion), movido: h.movido, pesos: textoFracciones(h.pesos) }))
    out.push({ id: x.id, n: k + 1, reglas: x.reglas.map((r, j) => ({ n: j + 1, frase: fraseRegla(r, j) })), tramos, tiempo, filas })
  })
  return out.length ? out : null
}
// §163 (parte 5b) · LAS SEÑALES del plan (las cuenta su motor, con el dinero de ESTE plan): cuántas entraron y, de las que no, por qué y
// cómo les habría ido. null sin lista (con un valor, la estrategia entra en todas sus señales).
export const MOTIVOS_SENAL = [['slots', 'sin hueco libre (ya estaban ocupados todos los puestos)'], ['filtro', 'no pasan el filtro de la prioridad'], ['dinero', 'sin dinero libre ese día'], ['yaDentro', 'ya tenías ese valor']]
export function resumenSenales(S) {
  if (!S || !S.generadas) return null
  const d = S.descartadas || [], conRet = d.filter(x => Number.isFinite(x.ret))
  const gan = conRet.filter(x => x.ret > 0), per = conRet.filter(x => x.ret < 0)
  const sumG = gan.reduce((s, x) => s + (x.cap > 0 ? x.hipotetico : x.ret), 0), sumP = per.reduce((s, x) => s - (x.cap > 0 ? x.hipotetico : x.ret), 0)
  const conCap = d.filter(x => x.cap > 0 && Number.isFinite(x.hipotetico))
  return { generadas: S.generadas, ejecutadas: S.ejecutadas, pct: S.ejecutadas / S.generadas, descartadas: d.length, motivos: S.motivos, porSimbolo: S.porSimbolo,
    ganadorasDesc: conRet.length ? gan.length / conRet.length : null, pfDesc: sumP > 0 ? sumG / sumP : null, hipotetico: conCap.length ? conCap.reduce((s, x) => s + x.hipotetico, 0) : null }
}
const ent = (x) => Math.round(x).toLocaleString('es-ES')
export function textoSenales(r) {
  if (!r) return ''
  const l = [`Señales de compra de la estrategia: ${ent(r.generadas)}`, `Entraron: ${ent(r.ejecutadas)} (${Math.round(r.pct * 100)} %)`, `No entraron: ${ent(r.descartadas)}`]
  for (const [k, t] of MOTIVOS_SENAL) if (r.motivos[k]) l.push(`  · ${t}: ${ent(r.motivos[k])}`)
  if (r.descartadas) {
    l.push('', 'Las que no entraron, si hubieran entrado:')
    if (r.ganadorasDesc != null) l.push(`  · ganadoras: ${(r.ganadorasDesc * 100).toFixed(1).replace('.', ',')} %`)
    if (r.pfDesc != null) l.push(`  · Profit Factor: ${r.pfDesc.toFixed(2).replace('.', ',')}`)
    if (r.hipotetico != null) l.push(`  · habrían ganado o perdido ≈ ${r.hipotetico >= 0 ? '+' : '−'}${ent(Math.abs(r.hipotetico))} € (estimación)`)
    l.push('', 'Contado con el dinero de ESTE plan (con su ocioso, sus aportaciones y sus impuestos). La estimación usa el dinero que le habría tocado a cada señal ese día; no cuenta el efecto en cadena de haberla hecho (habría ocupado un puesto y dinero que luego usaron otras).')
  } else l.push('', 'Entraron todas.')
  return l.join('\n')
}
// §162 · La peor caída de lo ganado con un valor (de pico a valle), en € y en % de lo que había entonces (lo aportado hasta el pico + lo
// ganado con ese valor en el pico). Ej.: llevaba +5.000 € con 10.000 € puestos y bajó a +2.000 €: −3.000 € y −3.000 / 15.000 = −20 %.
export function caidaDeCurva(c, serie) {
  if (!c?.length) return { eur: null, pct: null }
  let pico = c[0], iPico = 0, eur = 0, pct = 0
  for (let i = 1; i < c.length; i++) {
    if (c[i] > pico) { pico = c[i]; iPico = i }
    const d = c[i] - pico
    if (d < eur) { eur = d; const b = (serie?.[iPico]?.aportado || 0) + pico; pct = b > 0 ? d / b : null }
  }
  return { eur, pct }
}
// §162 · Lo que se busca en una fila del historial: TODO lo que se ve (valor, fechas, qué pasa, cantidades, precios e importes), sin tildes
// ni mayúsculas y sin el punto de los miles, para que «39» encuentre 397,00 € y «1234» encuentre 1.234,00 €.
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\./g, '')
const fechaEs = (d) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''
const num2 = (x) => Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : ''
export const textoDeOperacion = (o) => normaliza([o.bloque ? `parte#${o.bloque}#` : '', o.simbolo,fechaEs(o.entryDate), fechaEs(o.exitDate), num2(o.unidades), num2(o.entryPrice), num2(o.exitPrice), num2(o.resultado), o.pct == null ? '' : (o.pct * 100).toFixed(1).replace('.', ','), o.abierta ? 'abierta' : ''].join(' '))
export const textoDeMovimiento = (m) => normaliza([m.bloque ? `parte#${m.bloque}#` : '', m.simbolo || '',fechaEs(m.fecha), m.que, num2(m.importe), num2(m.coste)].join(' '))
// §188: «parte 2» se busca entero (si no, el «2» encontraría también fechas y precios de otras partes). §285: «bloque 2» también vale.
export const coincideBusqueda = (texto, busca) => { const q = normaliza(busca).trim().replace(/(?:BLOQUE|PARTE)\s*(\d+)/g, 'PARTE#$1#'); return !q || q.split(/\s+/).every(p => texto.includes(p)) }
// §157 (parte 3a) · GANANCIAS MENSUALES de tu dinero, del mismo cálculo. Por mes: pct = lo que crece cada euro (el VL, como el CAGR: las
// aportaciones no cuentan como ganancia; el primer mes sale del VL 1 de la apertura) y euros = patrimonio al acabar el mes − al acabar el
// anterior − lo aportado en el mes. El último mes incluye la venta final (comisión e impuestos): patrimonio = «Tienes al final». Por año:
// pct = el producto de sus meses (es la «Rentabilidad del plan» de «Año a año») y euros = la suma (todos los años suman la ganancia neta).
export function mensuales(serie, valorNeto) {
  const n = serie?.length || 0
  if (!n) return []
  const ultPat = serie[n - 1].patrimonio, neto = ultPat > 0 && Number.isFinite(valorNeto) ? valorNeto / ultPat : 1
  const anios = []
  for (let k = 0, h; k < n; k = h + 1) {
    const ym = serie[k].date.slice(0, 7)
    h = k; while (h + 1 < n && serie[h + 1].date.slice(0, 7) === ym) h++
    const ini = k ? serie[k - 1].vl : 1, fin = serie[h].vl * (h === n - 1 ? neto : 1)
    const patIni = k ? serie[k - 1].patrimonio : 0, patFin = h === n - 1 && Number.isFinite(valorNeto) ? valorNeto : serie[h].patrimonio
    let ap = 0; for (let i = k; i <= h; i++) ap += serie[i].aportadoHoy || 0
    const anio = ym.slice(0, 4), m = Number(ym.slice(5, 7)) - 1
    let fila = anios[anios.length - 1]
    if (!fila || fila.anio !== anio) { fila = { anio, meses: new Array(12).fill(null), pct: null, euros: 0 }; anios.push(fila) }
    fila.meses[m] = { pct: ini > 0 ? fin / ini - 1 : null, euros: patFin - patIni - ap }
  }
  for (const f of anios) { let p = 1, e = 0; for (const x of f.meses) if (x) { if (Number.isFinite(x.pct)) p *= 1 + x.pct; e += x.euros } f.pct = p - 1; f.euros = e }
  return anios
}
// §157 · DÓNDE ESTÁ TU DINERO CADA DÍA, al cierre, en partes de 1: en valores, en el ocioso y en liquidez (con «lo demás», que con una
// estrategia no hay). Y la media de cada parte en todo el periodo.
// §188: con varios bloques (bloques = [{ n, dias: su parte del dinero cada día }]), la parte en valores se parte por bloque: dias[i].bq[k]
// (el último bloque se lleva el redondeo, para que los bloques sumen exactamente «en valores») y la media de cada uno.
export function dondeEsta(serie, reparto, bloques = null) {
  const dias = (reparto || []).map((d, i) => { const p = serie[i]?.patrimonio; return p > 0 ? { valores: d.valores / p, ocioso: d.ocioso / p, liquidez: (d.liquidez + d.otros) / p } : { valores: 0, ocioso: 0, liquidez: 1 } })
  if (bloques?.length) dias.forEach((d, i) => { let s = 0; d.bq = bloques.map((b, k) => { if (k === bloques.length - 1) return Math.max(0, d.valores - s); const f = Math.min(Math.max(0, b.dias[i] || 0), Math.max(0, d.valores - s)); s += f; return f }) })
  const media = (k) => dias.length ? dias.reduce((s, d) => s + d[k], 0) / dias.length : null
  return { fechas: serie.map(p => p.date), dias, media: { valores: media('valores'), ocioso: media('ocioso'), liquidez: media('liquidez') },
    ...(bloques?.length ? { bloques: bloques.map((b, k) => ({ n: b.n, media: dias.length ? dias.reduce((s, d) => s + d.bq[k], 0) / dias.length : null })) } : {}) }
}
// §157 · RESULTADOS POR OPERACIÓN: cada operación del libro, por fecha de salida, con su resultado en euros (antes de comisiones) y en %
// (sobre lo que costó comprarla: resultado / compras).
// §188: numDe (con varios bloques): id del bloque → su número; cada operación lleva bloque = ese número.
export function porOperacion(operaciones, numDe = null) {
  const ops = [...(operaciones || [])].sort((a, b) => a.exitDate < b.exitDate ? -1 : a.exitDate > b.exitDate ? 1 : a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.simbolo < b.simbolo ? -1 : 1)
    .map(o => ({ ...(numDe ? { bloque: numDe.get(o.pieza) ?? null } : {}), simbolo: o.simbolo,entryDate: o.entryDate, exitDate: o.exitDate, resultado: o.resultado, pct: o.compras > 0 ? o.resultado / o.compras : null, abierta: !!o.abierta,
      entryPrice: o.entryPrice, exitPrice: o.exitPrice, unidades: o.unidades, compras: o.compras, ventas: o.ventas, costes: o.costes }))
  const ganan = ops.filter(o => o.resultado > 0).length, pierden = ops.filter(o => o.resultado < 0).length
  return { ops, ganan, pierden, mejor: ops.reduce((m, o) => !m || o.resultado > m.resultado ? o : m, null), peor: ops.reduce((m, o) => !m || o.resultado < m.resultado ? o : m, null) }
}
// §158 (parte 3b) · las operaciones con la forma del Backtesting, para reutilizar tal cual su Gantt (components/GanttChart.js, con un
// modo «pool»: el capital de cada una viaja con ella) y su Excel (exportHistorial de lib/exportTimeline.js). La que seguía abierta el
// último día va como «abierta» (_virtualClose), igual que allí.
const DIA = 864e5
export const diasEntre = (a, b) => a && b ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA) : null
export const tradesBacktesting = (ops) => (ops || []).map(o => ({ symbol: o.simbolo, entryDate: o.entryDate, exitDate: o.exitDate, entryPrice: o.entryPrice, exitPrice: o.exitPrice,
  _capitalAtEntry: o.compras, pnlSimple: o.resultado, pnlPct: o.pct == null ? null : o.pct * 100, dias: diasEntre(o.entryDate, o.exitDate), ...(o.abierta ? { _virtualClose: true, exitReason: 'Abierta' } : {}) }))
// §158 · el historial: las operaciones de la más reciente a la más antigua (por fecha de venta), filtradas (§162: en toda la fila; vacío = todas).
export function historial(ops, busca = '') {
  return [...(ops || [])].reverse().filter(o => coincideBusqueda(textoDeOperacion(o), busca))   // §162: en toda la fila
}
// §159 (parte 4a) · TODOS LOS MOVIMIENTOS del libro, en orden, con lo que pasa en palabras y, al cierre de ese día, el dinero en valores y
// en el ocioso. signo: + entra dinero en la cuenta (aportación) o en liquidez (venta); − sale (compra, impuestos). importe: lo que valen
// las participaciones (sin la comisión), como en el libro; para aportaciones e impuestos, su importe.
// §188: numDe (con varios bloques): las compras y ventas de un bloque llevan bloque = su número (las de la cuenta y la venta final, null).
// §204 · EL DINERO OCIOSO CON SU REGLA, DÍA A DÍA: por día, 0 = sin dinero libre (menos del 1 % del patrimonio en el ocioso o en liquidez),
// 1 = en el ocioso (la regla se cumplía), 2 = esperando (no se cumplía: en liquidez o en el otro símbolo); y la parte de los días de cada uno.
// null sin regla. Ejemplo: 10 días, 6 con todo en la acción, 3 en oro y 1 esperando → 60 % · 30 % · 10 %.
export function franjaOciosoRegla(ej, reparto, fechas) {
  const o = ej?.ociosoRegla, est = o?.estados || []
  if (!o || !reparto?.length) return null
  const dias = reparto.map((d, i) => { const p = ej.serie[i]?.patrimonio, libre = p > 0 ? ((d.ocioso || 0) + (d.liquidez || 0)) / p : 0; return libre < 0.01 ? 0 : est[i] ? 1 : 2 })
  const parte = (v) => dias.filter(x => x === v).length / dias.length
  return { dentro: o.dentro, fuera: o.fuera, fechas, dias, sin: parte(0), enDentro: parte(1), esperando: parte(2) }
}
export function movimientos(libro, serie, ocioso = 'LIQUIDEZ', numDe = null) {
  const L = libro, idx = new Map((serie || []).map((p, i) => [p.date, i]))
  if (!L?.movimientos) return []
  const nOc = nombreOcioso(ocioso)
  return L.movimientos.map((m, k) => {
    const i = idx.get(m.fecha), r = i != null ? L.reparto[i] : null
    let que, clase
    if (m.tipo === 'aportacion') { que = k === 0 ? 'Dinero inicial' : 'Aportación'; clase = 'aportacion' }
    else if (m.tipo === 'impuesto') { que = `Impuestos de ${Number(m.fecha.slice(0, 4)) - 1} (se pagan en julio)`; clase = 'impuesto' }
    else if (m.tipo === 'impuestoFinal') { que = 'Impuestos pendientes al vender todo el último día'; clase = 'impuesto' }
    else {
      const verbo = m.tipo === 'compra' ? 'Compra' : 'Vende', fin = m.tipo === 'ventaFinal' ? ' (venta final del último día)' : ''
      const cuanto = m.unidades > 0 ? ` · ${numeroCorto(m.unidades)} × ${eurosTexto(m.precio)}` : ''
      if (m.rol === 'ocioso') { que = `Ocioso: ${verbo.toLowerCase()} ${m.simbolo === 'GLD' ? 'oro (GLD)' : m.simbolo}${cuanto}${fin}${m.regla ? ' · por la regla del ocioso' : ''}`; clase = 'ocioso' }   // §204
      else { que = `${verbo} ${m.simbolo}${cuanto}${fin}`; clase = m.rol === 'valor' ? 'valor' : 'otro' }
    }
    const signo = m.tipo === 'aportacion' || m.tipo === 'venta' || m.tipo === 'ventaFinal' ? 1 : -1
    return { k, fecha: m.fecha, tipo: m.tipo, ...(numDe ? { bloque: m.pieza != null ? numDe.get(m.pieza) ?? null : null } : {}), simbolo: m.simbolo || null, que, clase, signo, importe: m.importe, coste: m.coste || 0,
      enValores: r ? r.valores : null, enOcioso: r ? (ocioso === 'LIQUIDEZ' ? r.liquidez + r.otros : r.ocioso) : null, nombreOcioso: nOc }
  })
}
const numeroCorto = (u) => { const d = u < 10 ? 4 : 2; return u.toFixed(d).replace('.', ',') }
const eurosTexto = (x) => Number.isFinite(x) ? `${x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €` : '—'
// Filtrar movimientos (en toda la fila: §162); vacío = todos. El más reciente arriba.
export function filtraMovimientos(movs, busca = '') {
  return [...(movs || [])].reverse().filter(m => coincideBusqueda(textoDeMovimiento(m), busca))   // §162: en toda la fila
}
// §160 (parte 4b) · LAS VELAS DE UN VALOR con sus operaciones del plan. velasDe: lo que da /api/velas ({ velas }) o una lista, recortado a
// las fechas del plan. opsEnVelas: cada operación de ese valor con el índice de su vela de compra y de venta (null si cae fuera).
export function velasDe(respuesta, desde, hasta) {
  const v = Array.isArray(respuesta) ? respuesta : respuesta?.velas
  return (v || []).filter(x => x && x.date >= desde && x.date <= hasta && x.close > 0)
}
export function opsEnVelas(velas, ops, simbolo) {
  const idx = new Map(velas.map((v, i) => [v.date, i]))
  return (ops || []).filter(o => o.simbolo === simbolo).map(o => ({ ...o, e: idx.get(o.entryDate) ?? null, x: idx.get(o.exitDate) ?? null }))
}
// §164 (parte 5c) · Las operaciones de un valor en la forma del gráfico del Backtesting (AssetSignalChart: stratSignals), en orden de compra:
// la n-ésima es la que resalta su globo. Y el foco de una operación: su número entre las de su valor y unas fechas alrededor (30 días antes de
// comprar y 30 después de vender), como hace el historial del Backtesting.
const ordenCompra = (a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0
export function senalesGrafico(ops, simbolo, nombre = 'Operaciones del plan') {
  const os = (ops || []).filter(o => o.simbolo === simbolo).sort(ordenCompra)
  return [{ id: '__plan__', name: nombre, color: '#58a6ff', entryColor: '#00e5a0', exitColor: '#ff4d6d',
    entries: os.map(o => ({ date: o.entryDate, price: o.entryPrice })), exits: os.map(o => ({ date: o.exitDate, price: o.exitPrice })),
    trades: os.map((o, k) => ({ n: k + 1, entryDate: o.entryDate, entryPx: o.entryPrice, exitDate: o.exitDate, exitPx: o.exitPrice, pnlPct: o.pct == null ? 0 : o.pct * 100, pnlSimple: o.resultado,
      capital: o.compras, inversion: o.compras, resultado: o.compras + o.resultado })) }]
}
const masDias = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
export function focoDeOperacion(ops, o) {
  if (!o) return null
  const os = (ops || []).filter(x => x.simbolo === o.simbolo).sort(ordenCompra)
  const k = os.findIndex(x => x.entryDate === o.entryDate && x.exitDate === o.exitDate)
  return k < 0 ? null : { sim: o.simbolo, n: k + 1, from: masDias(o.entryDate, -30), to: masDias(o.exitDate, 30), entryDate: o.entryDate, exitDate: o.exitDate, resultado: o.resultado }
}
// §158 · «Copiar para Claude»: el «Detalle» en texto (sin recalcular nada).
export function textoDetalle(detalle, { nombre = null, version = null } = {}) {
  if (!detalle) return ''
  const e = (x, d = 2) => Number.isFinite(x) ? `${x.toFixed(d)} €` : '—', p = (x, d = 2) => Number.isFinite(x) ? `${(x * 100).toFixed(d)} %` : '—'
  const { cabecera: c, suma: s, filas, total, ocioso, mensuales: me, porOperacion: po } = detalle
  const l = []
  l.push(`DETALLE DEL PLAN${nombre ? ` «${nombre}»` : ''}${version ? ` (${version})` : ''}`)
  l.push(`${c.valores} valores (${c.conOperaciones} con operaciones) · velas ${c.velas} · ${c.desde} → ${c.hasta} · ${c.operaciones} operaciones · ${c.ordenes} órdenes (${c.ordenesValores} de la estrategia, ${c.ordenesOcioso} del ocioso${c.ordenesOtras ? `, ${c.ordenesOtras} más` : ''})`)
  l.push(`LA SUMA: ${e(s.aportado)} aportado + ${e(s.valores)} ganado en los valores + ${e(s.ocioso)} ganado en el ocioso${Math.abs(s.otros) >= 0.005 ? ` + ${e(s.otros)} en lo demás` : ''} − ${e(s.costes)} comisiones − ${e(s.impuestos)} impuestos = ${e(s.final)} (${s.cuadra ? 'cuadra con «Tu dinero»' : 'NO cuadra con «Tu dinero»'})`)
  l.push('')
  if (detalle.bloques) {   // §188
    l.push('QUÉ APORTÓ CADA PARTE (antes de comisiones e impuestos)')
    l.push('Parte\t% del dinero\tAportó\tOperaciones\tGanadoras\tProfit Factor\tDinero en él (media)')
    for (const b of detalle.bloques) {
      l.push(`Parte ${b.n} · ${b.nombre} · ${b.donde} · velas ${b.velas}\t${p(b.peso, 0)}\t${e(b.aporto)}\t${b.operaciones}\t${p(b.ganadoras, 1)}\t${b.pf == null ? '—' : b.pf.toFixed(2)}\t${p(b.enEl, 1)}`)
      for (const v of b.valores) l.push(`  ${v.simbolo}\t\t${e(v.aporto)}\t${v.operaciones}\t${p(v.ganadoras, 1)}\t${v.pf == null ? '—' : v.pf.toFixed(2)}\t${v.compartido ? 'en varias partes' : p(v.enEl, 1)}`)
    }
    l.push('')
  }
  for (const r of detalle.reglas || []) {   // §200
    l.push(`CUÁNDO ACTUÓ CADA REGLA · BLOQUE ${r.n}`)
    for (const x of r.reglas) l.push(x.frase)
    l.push(`Tiempo: ${r.tiempo.map(t => `${t.estado ? `regla ${t.estado}` : 'ninguna regla'} ${p(t.parte, 1)}`).join(' · ')}`)
    l.push('Se cumplió	Actuó	Regla	Qué hizo	Movió	Pesos después')
    for (const f of r.filas) l.push(`${f.cumple}	${f.actua}	${f.regla}	${f.que}	${e(f.movido)}	${f.pesos}`)
    if (!r.filas.length) l.push('(ninguna regla llegó a actuar)')
    l.push('')
  }
  l.push('QUÉ APORTÓ CADA VALOR (antes de comisiones e impuestos)')
  l.push('Valor\tAportó\tOperaciones\tGanadoras\tProfit Factor\tTiempo dentro')
  for (const f of filas) l.push(`${f.simbolo}\t${e(f.aporto)}\t${f.operaciones}\t${p(f.ganadoras, 1)}\t${f.pf == null ? '—' : f.pf.toFixed(2)}\t${p(f.dentro, 1)}`)
  l.push(`TOTAL\t${e(total.aporto)}\t${total.operaciones}\t${p(total.ganadoras, 1)}\t${total.pf == null ? '—' : total.pf.toFixed(2)}\t${p(total.enValores, 1)} del dinero de media`)
  l.push(`Dinero ocioso (${nombreOcioso(ocioso.simbolo)})\t${e(ocioso.aporto)}\t${ocioso.ordenes} órdenes\t\t\t${p(ocioso.media, 1)} del dinero de media; en liquidez ${p(ocioso.liquidez, 1)}`)
  if (me?.length) { l.push(''); l.push('GANANCIAS POR AÑO (como «Año a año»)'); for (const f of me) l.push(`${f.anio}\t${p(f.pct)}\t${e(f.euros)}`) }
  if (po) { l.push(''); l.push(`OPERACIONES: ${po.ops.length} · ${po.ganan} ganan · ${po.pierden} pierden${po.mejor ? ` · mejor ${po.mejor.simbolo} ${e(po.mejor.resultado)} (${po.mejor.exitDate})` : ''}${po.peor ? ` · peor ${po.peor.simbolo} ${e(po.peor.resultado)} (${po.peor.exitDate})` : ''}`) }
  return l.join('\n')
}
// El nombre del dinero ocioso en la pantalla.
export const nombreOcioso = (s) => !s || s === 'LIQUIDEZ' ? 'liquidez' : s === 'GLD' ? 'oro (GLD)' : s
// Los textos de los «?» (nombres inventados y cuentas que cuadran con calculadora).
export const AYUDA_DETALLE = {
  pestana: '«Detalle» enseña por dentro el MISMO cálculo de «Tu dinero»: qué aportó cada valor, cuánto el dinero ocioso y cuánto se fue en comisiones e impuestos. No tiene ajustes propios: usa los del panel de la izquierda. Ejemplo: si «Tu dinero» dice que tienes al final 48.500 €, aquí verás 10.000 € que pusiste + 38.000 € ganados en los valores + 9.000 € ganados en el ocioso − 170 € de comisiones − 8.330 € de impuestos = 48.500 €.',
  suma: 'La suma de todo lo que ha pasado dentro del plan. Lo que pusiste + lo ganado en los valores + lo ganado con el dinero ocioso − las comisiones − los impuestos = lo que tienes al final. Es la misma cifra de la pestaña «Tu dinero», porque es el mismo cálculo. Ejemplo: 10.000 + 38.000 + 9.000 − 170 − 8.330 = 48.500 €.',
  ordenes: 'Órdenes = todas las compras y ventas: las de la estrategia, las del dinero ocioso y la venta de todo el último día. Cada una paga comisión. Ejemplo: 412 compras + 412 ventas de la estrategia + 96 del dinero ocioso = 920 órdenes; a 0,185 € cada una, 170,20 €.',
  cifras: 'Las cifras de la tabla del Backtesting que más se miran, del mismo cálculo de «Tu dinero». «Ganancia»: lo que tienes al final menos lo que pusiste, en € y en % de lo que pusiste. «Dinero en valores»: de media, la parte de tu dinero que estaba en valores (al pasar el ratón, en €). «Tiempo con algo invertido»: días con al menos una operación abierta ÷ días del plan. Ejemplo: 10.000 € → 48.500 € en 10 años: ganancia 38.500 € (+385 %) y CAGR 4,85^(1/10) − 1 = 17,1 %.',
  aportoPct: 'Lo que aportó ese valor en % de lo que pusiste (sin aportaciones, tu dinero inicial), como el «G.Comp %» del Backtesting. Los % de todos los valores suman el del total. Ejemplo: +14.200 € sobre 10.000 € son +142 %.',
  cagrValor: 'El «CAGR de su aportación», como en el Backtesting: lo que aportó ese valor sobre lo que pusiste, al año. Ejemplo: (10.000 + 14.200) / 10.000 = 2,42 en 10 años → 2,42^(1/10) − 1 = 9,2 % al año. Los € y los % de los valores suman el total; los CAGR no se suman.',
  caidaValor: 'La peor bajada de lo ganado con ese valor, de pico a valle, en € y en % de lo que había entonces (lo que habías puesto + lo ganado con ese valor). Ejemplo: llevaba +5.000 € con 10.000 € puestos y bajó a +2.000 €: −3.000 €, que es −3.000 / 15.000 = −20 %.',
  enEl: 'De media, la parte de tu dinero que estaba en ese valor cada día (al pasar el ratón, en €), como el «Cap. inv.» del Backtesting. Los días sin él cuentan como cero; los valores suman la fila del total. Junto a «Aportó» dice qué valor rinde más con el dinero que ocupa. Ejemplo: A y B aportan +2.000 €; A tuvo de media el 10 % de tu dinero y B el 40 %: A hizo lo mismo con la cuarta parte.',
  tabla: '«Aportó» = lo que ganó o perdió el plan con ese valor, en euros, antes de comisiones e impuestos (van aparte, en la línea de arriba). La suma de todos los valores es «ganado en los valores». «Ganadoras»: de cada 100 operaciones, cuántas ganan. «Profit Factor»: lo ganado en las que ganan dividido entre lo perdido en las que pierden; por encima de 1, gana. «Tiempo dentro»: la parte de los días del plan con ese valor en cartera. Ejemplo: un valor con 3 operaciones de +500 €, +100 € y −200 € aportó +400 €, 2 de 3 ganan (66,7 %) y su Profit Factor es 600 / 200 = 3.',
  ociosoRegla: 'Con la regla del dinero ocioso: cada día, dónde estaba el dinero que la estrategia no usaba. Amarillo: en el ocioso (la regla se cumplía). Naranja: esperando (no se cumplía: en liquidez o en el otro símbolo que elegiste). Gris: no había dinero libre (todo estaba en los valores). Debajo, la parte de los días de cada uno. Ejemplo: 10 días, 6 con todo en la acción, 3 en oro y 1 esperando → sin dinero libre 60 %, en oro 30 %, esperando 10 %. En «Historial › Todos los movimientos», cada venta y compra que hizo la regla dice «por la regla del ocioso».',
  ocioso: 'Lo que ganó el dinero mientras esperaba fuera de los valores, en lo que hayas elegido como dinero ocioso. En liquidez no gana nada. «De media»: cada día se mira qué parte de tu dinero está en el ocioso y se hace la media de todos los días. Ejemplo: un día con 7.000 € en valores y 3.000 € en oro → ese día, el 30 % en el ocioso.',
  valorAValor: 'Lo ganado con cada valor desde el primer día hasta cada día, en euros: lo cobrado en sus ventas, menos lo pagado en sus compras, más lo que vale lo que tienes de él ese día. Antes de comisiones e impuestos. El último punto de cada línea es su «Aportó» de la tabla. Ejemplo: compras 1.000 € de un valor, sube a 1.300 € y lo vendes: su línea sube hasta +300 € y ahí se queda hasta su siguiente compra. Pulsa un valor para resaltarlo.',
  mensuales: 'Lo que subió o bajó tu dinero cada mes: en %, lo que crece cada euro (sin contar tus aportaciones como ganancia, como el CAGR); al pasar el ratón, también en euros (lo que tienes al acabar el mes, menos lo que tenías al acabar el anterior, menos lo que aportaste ese mes). El último mes incluye la venta de todo, con su comisión y sus impuestos. La columna «Año» es la rentabilidad del año de «Año a año» en «Tu dinero». Ejemplo: +10 % en enero y −5 % en febrero son 1,10 × 0,95 = 1,045: +4,5 % en esos dos meses. En euros: acabas enero con 11.000 €, aportas 300 € en febrero y lo acabas con 10.735 €: febrero fue 10.735 − 11.000 − 300 = −565 €.',
  dondeEsta: 'Cada día, al cierre: de cada 100 € de tu dinero, cuántos están en valores (azul), cuántos en el dinero ocioso (amarillo) y cuántos en liquidez (gris). Debajo, la media de todo el periodo. Ejemplo: un día con 7.000 € en valores, 2.500 € en oro y 500 € en liquidez → 70 % · 25 % · 5 %. Al pasar el ratón, el reparto de ese día.',
  porOperacion: 'Una barra por operación, por orden de fecha de venta: verde si ganó, roja si perdió; la altura es lo que ganó o perdió en euros, antes de comisiones e impuestos. La que seguía abierta el último día se cuenta vendida ese día. Al pasar el ratón, el valor, sus fechas y su resultado en euros y en % (sobre lo que costó comprarla). Ejemplo: compras por 2.000 € y vendes por 2.300 € → +300 €, +15 %.',
  velas: 'El precio de este valor cada día del plan, con sus operaciones: ▲ verde donde compró y ▼ donde vendió, unidas por una línea verde si la operación ganó o roja si perdió. Son las operaciones de este plan (con su reparto, su dinero y sus filtros), no las de la estrategia sola. Al pasar el ratón, la fecha y el cierre; sobre una operación, sus fechas y su resultado. Ejemplo: compra a 100 € y vende a 120 € → línea verde de 100 a 120 y +20 %.',
  vistaGraficos: 'Un gráfico pequeño por cada valor del plan con sus operaciones, para ver de un vistazo dónde compró y vendió en cada uno. Pulsa uno para verlo en grande arriba, en «Cómo crece». Las velas se piden al abrir esta sección.',
  movimientos: 'Todo lo que pasa con tu dinero, por orden de fecha (lo más reciente arriba): el dinero inicial y cada aportación, cada compra y venta de la estrategia, lo que entra y sale del dinero ocioso y los impuestos de cada julio y del último día. «Importe» es lo que valen las acciones (o lo que entra o se paga), sin la comisión, que va aparte. «En valores» y «En el ocioso» son lo que tienes al cierre de ese día. Así puedes seguir cada euro con la calculadora. Ejemplo: vendes 12 NVDA a 250,00 € → +3.000,00 €, comisión 0,185 €; esa tarde el ocioso compra oro con lo cobrado: 3.000,00 − 0,185 − 0,185 = 2.999,63 € en oro.',
  historial: 'Cada operación de la estrategia: cuándo compró y vendió, cuántas acciones, a qué precio y cuánto ganó o perdió (en euros, antes de comisiones e impuestos; en %, sobre lo que costó comprarla). La más reciente arriba. Busca un valor para ver solo las suyas. «Gantt» las dibuja en el tiempo, una fila por valor; «Excel» las descarga. La que seguía abierta el último día se cuenta vendida ese día y sale como «abierta». Ejemplo: 12 acciones compradas a 215,00 € (2.580 €) y vendidas a 250,00 € (3.000 €) → +420 €, +16,3 %.',
  // §200 · las reglas de un bloque «Con pesos»
  reglas: 'Cuándo actuó cada regla «si… entonces…» de la parte. «Se cumplió» es el día en que, al cierre, se cumplió su condición; «Actuó», la apertura siguiente, cuando se hicieron las órdenes (si la condición es semanal, el lunes siguiente). «Movió» es el dinero que cambió de sitio dentro de la parte ese día, y «Pesos después», cómo quedó la parte. Las filas «Acaba la regla N» son la vuelta a los pesos de partida cuando la regla terminó (tras «mantener» o al cumplirse su «volver cuando…»). Ejemplo: la parte tiene 4.000 € en 80 % SPY + 20 % TQQQ; TQQQ cae un 40 % desde su máximo y la regla pasa a 60 % SPY + 40 % TQQQ: se venden 800 € de SPY y se compran 800 € de TQQQ → «Movió» 800 €, «Pesos después» 60 % SPY + 40 % TQQQ.',
  franjaReglas: 'Una franja por día del plan: gris los días sin ninguna regla en curso, y del color de cada regla los días en que esa regla estaba actuando (desde que actuó hasta que se volvió a los pesos de partida o acabó su «mantener»). Debajo, qué parte del tiempo pasó la parte en cada estado. Ejemplo: en 10 años (unos 2.520 días), si la regla 1 estuvo en curso 504 días, la franja la pinta el 20 % del tiempo.',
  // §188 · varios bloques (nombres inventados; cuentas que cuadran con calculadora)
  sumaBloques: 'Con varias partes, la suma va parte a parte: lo que pusiste + lo ganado con cada parte + lo ganado con el dinero ocioso de la cuenta − las comisiones − los impuestos = lo que tienes al final. Lo de cada parte es ANTES de comisiones e impuestos: los impuestos son de la cuenta (con todas tus acciones de cada valor), por eso no se reparten por parte. Ejemplo: 10.000 + 4.000 (parte 1) + 2.500 (parte 2) + 600 (ocioso) − 50 − 1.400 = 15.650 €.',
  bloques: 'Lo que ganó o perdió el plan con cada parte, en euros, antes de comisiones e impuestos (van aparte, en la línea de arriba). La primera fila, «Las N partes (sin el ocioso)», es lo de todas las partes juntos: púlsala para ver cada parte, y pulsa una parte para ver sus valores (o «Expandir todo»); sumados dan la fila de encima. El dinero ocioso va en su propia fila, debajo: el total del plan es la línea de arriba (bloques + ocioso − comisiones − impuestos). En la fila del ocioso, su «CAGR de su aportación» es lo que aportó a tu plan al año (no la rentabilidad del oro, porque tu dinero solo estuvo ahí parte del tiempo), y no hay ganadoras ni Profit Factor porque no hace operaciones con resultado. «Aportó %» = lo ganado ÷ lo que pusiste. «Dinero en él» = de media, qué parte de tu dinero estuvo dentro de esa parte cada día; las partes y el ocioso suman, más o menos, el 100 % (el resto, en liquidez). Si un valor está en dos partes, su «Dinero en él» y su «Peor caída» salen «—»: el motor lleva sus acciones juntas. Ejemplo: con 10.000 € puestos, la parte 1 · «Cruce de medias 50/200» gana +4.000 € (+40 %) con NVDA +2.100, MSFT +1.300, AAPL +900 y ASML −300 = 4.000 €.',
  bloqueABloque: 'Lo ganado con cada parte (y con el dinero ocioso de la cuenta) desde el primer día hasta cada día, en euros, antes de comisiones e impuestos. El último punto de cada línea es su «Aportó» de la tabla. Ejemplo: la parte 1 llega a +4.000 €, la parte 2 a +2.500 € y el ocioso a +600 €: entre los tres, 7.100 € ganados. Pulsa uno para resaltarlo.',
  dondeBloques: 'Con varias partes, la parte en valores se divide por partes, cada una con su color. Ejemplo: un día con 5.000 € en la parte 1, 3.000 € en la parte 2 y 2.000 € en oro → 50 % · 30 % · 20 %.',
  bh: 'Los «comprar y mantener» con las reglas de tu plan: el mismo dinero en las mismas fechas, con tus comisiones y tus impuestos, y vendiendo todo el último día. Son las mismas filas de «Tu dinero». Ejemplo: 10.000 € en Buy&Hold QQQ llegan a 49.500 € antes de vender; gana 39.500 €; impuestos 6.000 × 19 % + 33.500 × 21 % = 1.140 + 7.035 = 8.175 €; te quedan 49.500 − 8.175 = 41.325 € (menos las comisiones de las dos órdenes).',
}
