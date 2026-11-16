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
  const deLaLista = est.lista ? (est.simbolos || []) : est.simbolo ? [est.simbolo] : []
  const porValor = new Map()
  for (const o of L.operaciones) { if (!porValor.has(o.simbolo)) porValor.set(o.simbolo, []); porValor.get(o.simbolo).push(o) }
  // Los días que acaban con el valor en cartera: desde el día de la compra hasta la víspera de la venta (o hasta el último, si sigue abierta).
  const diasDentro = (ops) => {
    const d = new Uint8Array(n)
    for (const o of ops) { const i = idx.get(o.entryDate), j = idx.get(o.exitDate); if (i == null || j == null) continue; for (let k = i; k < (o.abierta ? j + 1 : j); k++) d[k] = 1 }
    let s = 0; for (let k = 0; k < n; k++) s += d[k]
    return n ? s / n : null
  }
  const filas = Object.entries(L.porSimbolo).filter(([, S]) => S.rol === 'valor').map(([simbolo, S]) => {
    const ops = porValor.get(simbolo) || []
    return { simbolo, aporto: S.ganado, ...resumenOps(ops), dentro: diasDentro(ops) }
  }).sort((a, b) => b.aporto - a.aporto || (a.simbolo < b.simbolo ? -1 : 1))
  const media = (k) => { let s = 0, m = 0; L.reparto.forEach((d, i) => { const pat = ej.serie[i].patrimonio; if (pat > 0) { s += d[k] / pat; m++ } }); return m ? s / m : null }
  const mov = (rol) => L.movimientos.filter(m => ORDEN.includes(m.tipo) && m.rol === rol).length
  const pu = L.puente, simOcioso = Object.entries(L.porSimbolo).filter(([, S]) => S.rol === 'ocioso').map(([a]) => a)
  const ordenes = ej.costes?.ordenes ?? null, deValores = mov('valor'), delOcioso = mov('ocioso')
  return {
    cabecera: { valores: deLaLista.length || filas.length, conOperaciones: filas.filter(f => f.operaciones > 0).length, velas: P.velas === 'semanales' ? 'semanales' : 'diarias', desde: fechas[0], hasta: fechas[n - 1],
      operaciones: L.operaciones.length, ordenes, ordenesValores: deValores, ordenesOcioso: delOcioso, ordenesOtras: ordenes != null ? ordenes - deValores - delOcioso : 0 },
    suma: { aportado: pu.aportado, valores: pu.ganadoValores, ocioso: pu.ganadoOcioso, otros: pu.ganadoOtros, costes: pu.costes, impuestos: pu.impuestos, final: pu.valorNeto, descuadre: pu.descuadre,
      cuadra: Math.abs(pu.descuadre) < 0.005 && Math.abs(pu.valorNeto - (ev.medidas?.valorNeto ?? pu.valorNeto)) < 0.005 },
    filas, total: { aporto: pu.ganadoValores, ...resumenOps(L.operaciones), enValores: media('valores') },
    ocioso: { simbolos: simOcioso, simbolo: P.ocioso || 'LIQUIDEZ', aporto: pu.ganadoOcioso, ordenes: delOcioso, media: media('ocioso'), liquidez: media('liquidez') },
    // §157 (parte 3a)
    mensuales: mensuales(ej.serie, ev.medidas?.valorNeto ?? pu.valorNeto), donde: dondeEsta(ej.serie, L.reparto), porOperacion: porOperacion(L.operaciones),
    movimientos: movimientos(L, ej.serie, P.ocioso || 'LIQUIDEZ'),   // §159
    curvas: { fechas, series: [...filas.map(f => ({ simbolo: f.simbolo, rol: 'valor', v: L.curvas?.[f.simbolo] || [] })), ...simOcioso.map(a => ({ simbolo: a, rol: 'ocioso', v: L.curvas?.[a] || [] }))].filter(s => s.v.length === n) },
  }
}
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
export function dondeEsta(serie, reparto) {
  const dias = (reparto || []).map((d, i) => { const p = serie[i]?.patrimonio; return p > 0 ? { valores: d.valores / p, ocioso: d.ocioso / p, liquidez: (d.liquidez + d.otros) / p } : { valores: 0, ocioso: 0, liquidez: 1 } })
  const media = (k) => dias.length ? dias.reduce((s, d) => s + d[k], 0) / dias.length : null
  return { fechas: serie.map(p => p.date), dias, media: { valores: media('valores'), ocioso: media('ocioso'), liquidez: media('liquidez') } }
}
// §157 · RESULTADOS POR OPERACIÓN: cada operación del libro, por fecha de salida, con su resultado en euros (antes de comisiones) y en %
// (sobre lo que costó comprarla: resultado / compras).
export function porOperacion(operaciones) {
  const ops = [...(operaciones || [])].sort((a, b) => a.exitDate < b.exitDate ? -1 : a.exitDate > b.exitDate ? 1 : a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.simbolo < b.simbolo ? -1 : 1)
    .map(o => ({ simbolo: o.simbolo, entryDate: o.entryDate, exitDate: o.exitDate, resultado: o.resultado, pct: o.compras > 0 ? o.resultado / o.compras : null, abierta: !!o.abierta,
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
// §158 · el historial: las operaciones de la más reciente a la más antigua (por fecha de venta), filtradas por valor (sin mayúsculas ni
// tildes; vacío = todas).
export function historial(ops, busca = '') {
  const q = String(busca || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
  return [...(ops || [])].reverse().filter(o => !q || o.simbolo.toUpperCase().includes(q))
}
// §159 (parte 4a) · TODOS LOS MOVIMIENTOS del libro, en orden, con lo que pasa en palabras y, al cierre de ese día, el dinero en valores y
// en el ocioso. signo: + entra dinero en la cuenta (aportación) o en liquidez (venta); − sale (compra, impuestos). importe: lo que valen
// las participaciones (sin la comisión), como en el libro; para aportaciones e impuestos, su importe.
export function movimientos(libro, serie, ocioso = 'LIQUIDEZ') {
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
      if (m.rol === 'ocioso') { que = `Ocioso: ${verbo.toLowerCase()} ${m.simbolo === 'GLD' ? 'oro (GLD)' : m.simbolo}${cuanto}${fin}`; clase = 'ocioso' }
      else { que = `${verbo} ${m.simbolo}${cuanto}${fin}`; clase = m.rol === 'valor' ? 'valor' : 'otro' }
    }
    const signo = m.tipo === 'aportacion' || m.tipo === 'venta' || m.tipo === 'ventaFinal' ? 1 : -1
    return { k, fecha: m.fecha, tipo: m.tipo, simbolo: m.simbolo || null, que, clase, signo, importe: m.importe, coste: m.coste || 0,
      enValores: r ? r.valores : null, enOcioso: r ? (ocioso === 'LIQUIDEZ' ? r.liquidez + r.otros : r.ocioso) : null, nombreOcioso: nOc }
  })
}
const numeroCorto = (u) => { const d = u < 10 ? 4 : 2; return u.toFixed(d).replace('.', ',') }
const eurosTexto = (x) => Number.isFinite(x) ? `${x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €` : '—'
// Filtrar movimientos por valor (sin mayúsculas ni tildes); vacío = todos. El más reciente arriba.
export function filtraMovimientos(movs, busca = '') {
  const q = String(busca || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
  return [...(movs || [])].reverse().filter(m => !q || (m.simbolo || '').toUpperCase().includes(q) || (q.length >= 3 && m.que.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().includes(q)))
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
  tabla: '«Aportó» = lo que ganó o perdió el plan con ese valor, en euros, antes de comisiones e impuestos (van aparte, en la línea de arriba). La suma de todos los valores es «ganado en los valores». «Ganadoras»: de cada 100 operaciones, cuántas ganan. «Profit Factor»: lo ganado en las que ganan dividido entre lo perdido en las que pierden; por encima de 1, gana. «Tiempo dentro»: la parte de los días del plan con ese valor en cartera. Ejemplo: un valor con 3 operaciones de +500 €, +100 € y −200 € aportó +400 €, 2 de 3 ganan (66,7 %) y su Profit Factor es 600 / 200 = 3.',
  ocioso: 'Lo que ganó el dinero mientras esperaba fuera de los valores, en lo que hayas elegido como dinero ocioso. En liquidez no gana nada. «De media»: cada día se mira qué parte de tu dinero está en el ocioso y se hace la media de todos los días. Ejemplo: un día con 7.000 € en valores y 3.000 € en oro → ese día, el 30 % en el ocioso.',
  valorAValor: 'Lo ganado con cada valor desde el primer día hasta cada día, en euros: lo cobrado en sus ventas, menos lo pagado en sus compras, más lo que vale lo que tienes de él ese día. Antes de comisiones e impuestos. El último punto de cada línea es su «Aportó» de la tabla. Ejemplo: compras 1.000 € de un valor, sube a 1.300 € y lo vendes: su línea sube hasta +300 € y ahí se queda hasta su siguiente compra. Pulsa un valor para resaltarlo.',
  mensuales: 'Lo que subió o bajó tu dinero cada mes: en %, lo que crece cada euro (sin contar tus aportaciones como ganancia, como el CAGR); al pasar el ratón, también en euros (lo que tienes al acabar el mes, menos lo que tenías al acabar el anterior, menos lo que aportaste ese mes). El último mes incluye la venta de todo, con su comisión y sus impuestos. La columna «Año» es la rentabilidad del año de «Año a año» en «Tu dinero». Ejemplo: +10 % en enero y −5 % en febrero son 1,10 × 0,95 = 1,045: +4,5 % en esos dos meses. En euros: acabas enero con 11.000 €, aportas 300 € en febrero y lo acabas con 10.735 €: febrero fue 10.735 − 11.000 − 300 = −565 €.',
  dondeEsta: 'Cada día, al cierre: de cada 100 € de tu dinero, cuántos están en valores (azul), cuántos en el dinero ocioso (amarillo) y cuántos en liquidez (gris). Debajo, la media de todo el periodo. Ejemplo: un día con 7.000 € en valores, 2.500 € en oro y 500 € en liquidez → 70 % · 25 % · 5 %. Al pasar el ratón, el reparto de ese día.',
  porOperacion: 'Una barra por operación, por orden de fecha de venta: verde si ganó, roja si perdió; la altura es lo que ganó o perdió en euros, antes de comisiones e impuestos. La que seguía abierta el último día se cuenta vendida ese día. Al pasar el ratón, el valor, sus fechas y su resultado en euros y en % (sobre lo que costó comprarla). Ejemplo: compras por 2.000 € y vendes por 2.300 € → +300 €, +15 %.',
  movimientos: 'Todo lo que pasa con tu dinero, por orden de fecha (lo más reciente arriba): el dinero inicial y cada aportación, cada compra y venta de la estrategia, lo que entra y sale del dinero ocioso y los impuestos de cada julio y del último día. «Importe» es lo que valen las acciones (o lo que entra o se paga), sin la comisión, que va aparte. «En valores» y «En el ocioso» son lo que tienes al cierre de ese día. Así puedes seguir cada euro con la calculadora. Ejemplo: vendes 12 NVDA a 250,00 € → +3.000,00 €, comisión 0,185 €; esa tarde el ocioso compra oro con lo cobrado: 3.000,00 − 0,185 − 0,185 = 2.999,63 € en oro.',
  historial: 'Cada operación de la estrategia: cuándo compró y vendió, cuántas acciones, a qué precio y cuánto ganó o perdió (en euros, antes de comisiones e impuestos; en %, sobre lo que costó comprarla). La más reciente arriba. Busca un valor para ver solo las suyas. «Gantt» las dibuja en el tiempo, una fila por valor; «Excel» las descarga. La que seguía abierta el último día se cuenta vendida ese día y sale como «abierta». Ejemplo: 12 acciones compradas a 215,00 € (2.580 €) y vendidas a 250,00 € (3.000 €) → +420 €, +16,3 %.',
  bh: 'Los «comprar y mantener» con las reglas de tu plan: el mismo dinero en las mismas fechas, con tus comisiones y tus impuestos, y vendiendo todo el último día. Son las mismas filas de «Tu dinero». Ejemplo: 10.000 € en Buy&Hold QQQ llegan a 49.500 € antes de vender; gana 39.500 €; impuestos 6.000 × 19 % + 33.500 × 21 % = 1.140 + 7.035 = 8.175 €; te quedan 49.500 − 8.175 = 41.325 € (menos las comisiones de las dos órdenes).',
}
