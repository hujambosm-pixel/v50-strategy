// lib/builder/planPantalla.js — lo que pinta la pantalla «Convertirla en plan» del paso 3 (components/BuilderPlan.js; docs/builder.md,
// §48): los ajustes de la pantalla y el plan que salen de ellos (el formato 1 de lib/planes/plan.js con la pieza «estrategia»), las
// cifras que se leen de la respuesta de /api/plan, los tramos, el estado de la prueba del paso 2, los textos de los «?», el texto de
// «Copiar para Claude» y el temporizador que recalcula tras ~600 ms. Puro: no toca la red ni React. No calcula nada del plan: todas las
// cifras salen del motor (lib/planes/), tal cual.
import { fotoDe } from '../pruebaAzar'
import { twrAnual } from '../planes/medidas'

export const ESPERA_CALCULO = 600
export const PERIODOS_PLAN = [
  { id: 'todo', nombre: '2016–2025', desde: '2016-01-01', hasta: '2025-12-31' },
  { id: 'p1', nombre: 'Solo 2016–2020', desde: '2016-01-01', hasta: '2020-12-31' },
  { id: 'p2', nombre: 'Solo 2021–2025', desde: '2021-01-01', hasta: '2025-12-31' },
  { id: 'otras', nombre: 'Otras fechas' },
]
// Los tramos de «¿Es estable?»: los mismos dos periodos del paso 2.
export const TRAMOS_PLAN = [{ nombre: '2016–2020', desde: '2016-01-01', hasta: '2020-12-31' }, { nombre: '2021–2025', desde: '2021-01-01', hasta: '2025-12-31' }]
export const OCIOSOS_FIJOS = [['LIQUIDEZ', 'Liquidez al 0 %'], ['QQQ', 'QQQ'], ['GLD', 'Oro (GLD)']]
export const SUBIDA_DEFECTO = 3
export const AJUSTES_PLAN = Object.freeze({
  activo: 'AAPL', periodo: 'todo', desde: '2016-01-01', hasta: '2025-12-31', capital: 10000, aportacion: 300, sube: false, subePct: SUBIDA_DEFECTO,
  ocioso: 'LIQUIDEZ', aportacionDentro: 'espera', apalancamiento: 1, impuestos: 'ES-ahorro', comision: 0.1,
})
export const esSemanal = (fila) => fotoDe(fila).params?.intervalo === 'semanal'
export const fechasDe = (a) => { const p = PERIODOS_PLAN.find(x => x.id === a.periodo); return p?.desde ? { desde: p.desde, hasta: p.hasta } : { desde: a.desde, hasta: a.hasta } }

// El plan (formato 1) de unos ajustes y una estrategia de tarjetas (su foto, como la que congela el paso 2). Comisión sin mínimo ni
// horquilla; las aportaciones, mensuales (crecimientoAnual 0 si son fijas).
export function planDe(a, estrategia, nombre = null) {
  return {
    tipo: 'plan', formato: 1, calculo: 1, ...(nombre ? { nombre } : {}),
    dinero: { capitalInicial: Number(a.capital) || 0, aportaciones: Number(a.aportacion) > 0 ? { importe: Number(a.aportacion), frecuencia: 'mensual', crecimientoAnual: a.sube ? Number(a.subePct) || 0 : 0 } : { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', estrategia: fotoDe(estrategia), activo: a.activo, peso: 1, ocioso: a.ocioso, aportacionDentro: a.aportacionDentro, apalancamiento: a.apalancamiento, velas: 'diarias' }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } },
    impuestos: { regimen: a.impuestos, reglaDosMeses: true },
    costes: Number(a.comision) > 0 ? { comisionPct: Number(a.comision), comisionMinEur: 0, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } } : null,
    periodo: fechasDe(a),
  }
}
// Los ajustes de un plan guardado (el inverso de planDe).
export function ajustesDe(plan) {
  const x = plan.piezas.find(p => p.tipo === 'estrategia'), ap = plan.dinero.aportaciones || {}, f = plan.periodo
  const p = PERIODOS_PLAN.find(q => q.desde === f.desde && q.hasta === f.hasta)
  return { activo: x.activo, periodo: p ? p.id : 'otras', desde: f.desde, hasta: f.hasta, capital: plan.dinero.capitalInicial, aportacion: ap.frecuencia === 'mensual' ? ap.importe : 0,
    sube: ap.crecimientoAnual > 0, subePct: ap.crecimientoAnual > 0 ? ap.crecimientoAnual : SUBIDA_DEFECTO, ocioso: x.ocioso, aportacionDentro: x.aportacionDentro || 'espera',
    apalancamiento: x.apalancamiento || 1, impuestos: plan.impuestos.regimen, comision: plan.costes ? plan.costes.comisionPct : 0 }
}

// ── La prueba del paso 2 ──
// pruebas: las de listarPruebas (lib/pruebaAzar.js); huella: la de la estrategia de ahora. 'pasa' si alguna con esa huella pasa;
// 'noPasa' si las hay con esa huella y ninguna pasa; 'sinPrueba' si no hay ninguna con esa huella. fila: la que se explica en el «?»
// (la que pasa o, si no, la más reciente con esa huella).
export function estadoPrueba(pruebas, huella) {
  if (!pruebas || !huella) return null
  const mias = pruebas.filter(p => p.estrategia_huella === huella), conResultado = mias.filter(p => p.resultado)
  const pasa = conResultado.find(p => p.resultado.veredicto === 'pasa')
  if (pasa) return { clave: 'pasa', fila: pasa }
  if (conResultado.length) return { clave: 'noPasa', fila: conResultado[0] }
  return { clave: 'sinPrueba', fila: null }
}
export const AVISO_PRUEBA = {
  noPasa: 'Esta estrategia NO ha superado al azar: estos resultados pueden ser suerte',
  sinPrueba: 'Esta estrategia no tiene prueba contra el azar: estos resultados pueden ser suerte',
  pasa: 'Esta estrategia ha superado la prueba contra el azar',
}
export const AVISO_A_MANO = 'Acción elegida a mano, sabiendo cómo le fue'

// ── Formato ──
const miles = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export function numero(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '—'
  const r = Math.abs(x).toFixed(d), [e, f] = r.split('.'), neg = x < 0 && Number(r) !== 0
  return `${neg ? '−' : ''}${miles(e)}${f ? `,${f}` : ''}`
}
export const euros = (x, d = 2) => x == null || !Number.isFinite(x) ? '—' : `${numero(x, d)} €`
export const pct = (fr, d = 2) => fr == null || !Number.isFinite(fr) ? '—' : `${numero(fr * 100, d)} %`
export const puntos = (fr) => fr == null || !Number.isFinite(fr) ? '—' : `${fr > 0 ? '+' : ''}${numero(fr * 100, 2)} puntos`
export const fechaCorta = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'

// El texto del «?» del aviso de la prueba: las cifras de la prueba (gana al X % de las copias en cada periodo).
export function ayudaPrueba(estado, resultado) {
  const R = 'Para pasar, tiene que ganar al 95 % de las copias que compran en fechas al azar en 2016–2020 y en 2021–2025 (paso 2).'
  if (!estado) return `Leyendo las pruebas de esta estrategia… ${R}`
  if (estado.clave === 'sinPrueba') return `Esta versión de la estrategia no se ha probado contra el azar en el paso 2. ${R} Sin esa prueba, no se sabe si sus compras aportan algo o si fue suerte (o que el mercado subía). Ejemplo: si gana a 960 de 1.000 copias en los dos periodos (96 %), pasa.`
  const f = estado.fila, ps = resultado?.periodos || []
  const cifras = ps.length ? `gana al ${ps.map(p => `${numero(p.percentil, 1)} % de las copias en ${p.nombre}`).join(' y al ')}` : 'sus cifras se están leyendo'
  return `Prueba del ${fechaCorta(f.creada_en)} en ${f.valor} (velas ${f.velas}): ${cifras}. ${R}${estado.clave === 'noPasa' ? ' Como no pasa, una curva bonita aquí puede ser solo suerte.' : ''}`
}

// ── Las cifras de la respuesta de /api/plan ──
// El CAGR (por VL) de un tramo [desde, hasta] de la serie del plan, o null si el periodo del plan no lo cubre entero. Empieza en el
// VL 1 de la apertura del primer día si el tramo empieza con el plan; si no, en el último cierre antes del tramo.
export function cagrTramo(fechas, vl, periodo, tramo) {
  if (!(periodo.desde <= tramo.desde && periodo.hasta >= tramo.hasta) || !fechas?.length) return null
  const k0 = fechas.findIndex(f => f >= tramo.desde), k1 = fechas.reduce((m, f, k) => f <= tramo.hasta ? k : m, -1)
  if (k0 < 0 || k1 <= k0) return null
  const ini = k0 === 0 ? { date: fechas[0], vl: 1 } : { date: fechas[k0 - 1], vl: vl[k0 - 1] }
  return twrAnual([ini, { date: fechas[k1], vl: vl[k1] }])
}
const ORDEN_ALTERNATIVAS = ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY', 'LIQUIDEZ']
// respuesta: la de /api/plan con curvas: true. Devuelve todo lo que pinta la columna derecha.
export function cifrasPlan(respuesta, plan) {
  const ev = respuesta.evaluacion, m = ev.plan.medidas, ej = ev.plan.ejecucion, est = ej.estrategias?.e || {}
  const fechas = ej.serie.map(p => p.date), vl = ej.serie.map(p => p.vl)
  const refs = Object.fromEntries(ev.referencias.map(r => [r.id, r]))
  const curvas = respuesta.curvas || {}
  const fila = (id, nombre, mm) => ({ id, nombre, final: mm.valorNeto, twr: mm.twr, tir: mm.tir, caida: mm.caida.caida, impuestos: mm.impuestosPagados, costes: mm.costesPagados })
  const alternativas = [fila('PLAN', 'Tu plan', m), ...ORDEN_ALTERNATIVAS.filter(id => refs[id]).map(id => fila(id, refs[id].nombre, refs[id].medidas))]
  const vlLiq = curvas.OCIOSO_LIQUIDEZ?.vl
  const tramos = TRAMOS_PLAN.map(t => {
    const cagr = cagrTramo(fechas, vl, plan.periodo, t), liq = vlLiq ? cagrTramo(fechas, vlLiq, plan.periodo, t) : null
    return { nombre: t.nombre, cagr, ocioso: cagr != null && liq != null ? cagr - liq : null }
  })
  const caidas = ev.descorrelacion?.e || []
  return {
    seis: { aportado: m.aportado, final: m.valorNeto, ganancia: m.ganancia, caidaPct: m.caida.caida, caidaPctValle: m.caida.valle, caidaPctPico: m.caida.pico,
      caidaEuros: m.caidaEuros.euros, caidaEurosValle: m.caidaEuros.valle, caidaEurosPico: m.caidaEuros.pico, twr: m.twr, tir: m.tir, impuestos: m.impuestosPagados, costes: m.costesPagados },
    curva: { fechas, plan: ej.serie.map(p => p.patrimonio), aportado: ej.serie.map(p => p.aportado), ociosoLiquidez: curvas.OCIOSO_LIQUIDEZ?.patrimonio || null, activo: curvas.ACTIVO?.patrimonio || null, dentro: est.dentro || [] },
    alternativas, tramos, caidas, subio: caidas.filter(c => c.ocioso > 0).length,
    operaciones: (est.operaciones || []).length, ordenes: ej.costes?.ordenes ?? null, desde: m.desde, hasta: m.hasta, huella: respuesta.huella,
  }
}
export const fraseCaidas = (c, ocioso) => !c.caidas.length ? 'Tu estrategia no tuvo caídas en este periodo.'
  : `En ${c.subio} de las ${c.caidas.length} peores caídas, el ocioso subió${ocioso === 'LIQUIDEZ' ? ' (la liquidez no sube ni baja)' : ''}.`

// ── Textos de los «?» (cada término, con un ejemplo con números) ──
export const AYUDA_PLAN = {
  aMano: 'En 2016 nadie sabía cómo acabaría esta acción. Elegirla hoy, sabiendo que le fue bien, infla el pasado: es como apostar a un caballo después de ver la carrera. Ejemplo: si eliges hoy la mejor de 100 acciones, su curva de 2016–2025 sale preciosa aunque tu estrategia no aporte nada. Este aviso desaparecerá cuando el plan use listas del screener elegidas con los datos de cada momento.',
  bloque: 'Un bloque es una parte de tu dinero con su estrategia y dónde se aplica. Por ahora, un solo bloque con todo tu dinero.',
  estrategia: 'La regla de compra y venta, tal como está guardada (la misma del paso 1 y del paso 2). Solo las de tarjetas y de velas diarias: las semanales llegarán más adelante.',
  dondeSeAplica: 'Una acción: tu estrategia compra y vende solo esa acción. Ejemplo: EMA20 en AAPL compra AAPL cuando su precio cruza su media de 20 días y la vende al cruzar por debajo. «Una lista» llegará cuando los pasos 1 y 2 admitan listas.',
  parte: 'Qué parte de tu dinero va a este bloque. Con un solo bloque, el 100 %: de 10.000 €, los 10.000 €.',
  modo: 'Cómo se reparte el dinero del bloque entre los valores de una lista (por ejemplo, a partes iguales). Solo hace falta con listas.',
  anadirBloque: 'Para repartir tu dinero entre varias estrategias (por ejemplo, 60 % en una y 40 % en otra). Llegará más adelante.',
  periodo: 'Las fechas del plan. Ejemplo: con 2016–2025, el primer día de bolsa de 2016 entra el dinero inicial y el 31/12/2025 se vende todo (con sus impuestos) para ver cuánto te queda.',
  capital: 'El dinero que metes el primer día. Ejemplo: 10.000 € el primer día de bolsa de 2016.',
  aportacion: 'Lo que añades cada mes, el primer día de bolsa del mes. Ejemplo: en 2016–2025, 300 € al mes son 119 aportaciones (de febrero de 2016 a diciembre de 2025: en enero de 2016 entra el dinero inicial), 35.700 € más. «Sube cada año»: con 3 %, 300 € el primer año, 309 € el segundo, 318,27 € el tercero…',
  ocioso: 'Dónde espera tu dinero mientras la estrategia no tiene ninguna operación abierta. Liquidez al 0 %: quieto. QQQ u oro (GLD): se compra al salir de una operación y se vende al entrar en la siguiente (con sus comisiones e impuestos). Ejemplo: si la estrategia está fuera el 40 % del tiempo, ese 40 % puede crecer con el oro o quedarse quieto.',
  dentro: 'Si llega tu aportación mensual mientras la estrategia tiene una operación abierta. «Espera»: va al ocioso y entra con la siguiente compra. «Compra más acción»: compra más acción ese mismo día. Ejemplo: entra AAPL el día 3 y el día 1 del mes siguiente llegan 300 €: con «Espera», esos 300 € van al ocioso hasta la próxima compra.',
  apalancamiento: 'Multiplica el movimiento diario de la acción mientras estás dentro (como un ETF ×2 o ×3, con su coste). Ejemplo: si AAPL sube un 1 % un día, con ×2 subes un 2 %; si baja un 10 %, con ×2 bajas un 20 %. El ocioso nunca se apalanca.',
  impuestos: 'España · base del ahorro: lo que ganas al vender paga el 19 %, 21 %, 23 %… por tramos, cada julio por el año anterior, con la compensación de pérdidas y la regla de los dos meses; al final se vende todo y se paga lo pendiente. Ejemplo: ganas 1.000 € vendiendo en 2018 → en julio de 2019 pagas 190 €.',
  comision: 'Lo que cobra el bróker en cada compra y en cada venta, en % de lo que mueves (sin mínimo). Ejemplo: con 0,1 %, comprar 10.000 € cuesta 10 €. Cada entrada y salida de la estrategia mueve todo el dinero dos veces (vende el ocioso y compra la acción).',
  aportado: 'Todo lo que has metido de tu bolsillo: el dinero inicial más las aportaciones. Ejemplo: en 2016–2025, 10.000 € + 119 × 300 € = 45.700 €.',
  final: 'Lo que te queda al final después de vender todo y pagar comisiones e impuestos. La ganancia neta es esto menos lo aportado. Ejemplo: aportas 45.700 € y te quedan 114.340,91 € → ganancia neta de 68.640,91 €.',
  caida: 'La peor bajada de pico a valle. En %: la de tu estrategia (el valor de cada euro, sin contar aportaciones). En €: la de tu dinero total, que engaña porque las aportaciones la tapan. Ejemplo: de 50.000 € a 33.000 € es −17.000 € (−34 %).',
  twr: 'Lo que crece cada euro al año, sin contar las aportaciones (es el TWR, antes de liquidar al final). Sirve para comparar estrategias. Ejemplo: 100 € → 262 € en 10 años es el 10,1 % al año.',
  tir: 'Cuánto rindió lo que aportaste contando cuándo entró cada euro, como un plan de pensiones (la TIR, tras comisiones e impuestos). Ejemplo: un euro aportado en 2024 solo ha tenido 2 años para crecer; uno de 2016, diez.',
  costes: 'Impuestos: lo pagado cada julio más lo de la venta final. Comisiones: las de todas las compras y ventas, también las del ocioso y la venta final.',
  grafico: 'Tu dinero cada día: tu plan, el mismo plan con el ocioso en liquidez, lo mismo metido en la acción sin vender nunca, y lo que has aportado (en escalones: sube cada mes). Escala logarítmica: la misma distancia es el mismo %. Ejemplo: de 10.000 € a 20.000 € ocupa lo mismo que de 50.000 € a 100.000 €.',
  franja: 'Debajo del gráfico: los días que tu dinero está dentro de la acción (azul) y en el ocioso (gris).',
  alternativas: 'El mismo dinero, en las mismas fechas, con las mismas comisiones e impuestos, metido en otras cosas. Ejemplo: «Lo mismo a QQQ» compra QQQ con los 10.000 € y con cada aportación, y no vende hasta el final.',
  tramos: 'El CAGR de tu plan en cada mitad, del mismo cálculo (sin repetirlo). Si una mitad va muy bien y la otra muy mal, el plan es poco estable. «El ocioso añadió»: la diferencia con el mismo plan con el ocioso en liquidez. Ejemplo: 15 % con oro y 12 % con liquidez → +3 puntos.',
  caidas: 'Las 5 peores caídas de tu estrategia sola (sin el ocioso), de su pico a su valle, y lo que hizo el ocioso en esas mismas fechas. Un buen ocioso sube (o baja poco) cuando tu estrategia cae. Ejemplo: tu estrategia cae un 20 % y en esas fechas el oro sube un 5 %.',
}

// ── Copiar para Claude ──
export function textoParaClaudePlan({ ajustes, estrategia, plan, cifras, estado, resultadoPrueba, version, nombre = null }) {
  const L = [], a = ajustes, fs = fechasDe(a)
  L.push(`Plan de inversión (paso 3 del Builder)${nombre ? ` · «${nombre}»` : ''} · app ${version || '—'}`)
  L.push(`Estrategia: ${estrategia?.name || '—'} (id ${estrategia?.id ?? '—'}) · prueba contra el azar: ${estado ? { pasa: 'pasa', noPasa: 'NO pasa', sinPrueba: 'sin prueba' }[estado.clave] : '—'}${resultadoPrueba?.periodos ? ` (${resultadoPrueba.periodos.map(p => `${p.nombre}: gana al ${numero(p.percentil, 1)} %`).join(', ')})` : ''}`)
  L.push(`Dónde: una acción, ${a.activo} (elegida a mano) · 100 % del dinero · velas diarias`)
  L.push(`Periodo: ${fs.desde} → ${fs.hasta} · dinero inicial ${euros(Number(a.capital))} · aportación mensual ${euros(Number(a.aportacion))}${a.sube ? ` (sube un ${numero(Number(a.subePct), 2)} % cada año)` : ' (fija)'}`)
  L.push(`Dinero ocioso: ${a.ocioso} · aportación con la operación abierta: ${a.aportacionDentro === 'compra' ? 'compra más acción' : 'espera en el ocioso'} · apalancamiento ${a.apalancamiento > 1 ? `×${a.apalancamiento}` : 'no'} · impuestos ${a.impuestos === 'ES-ahorro' ? 'España (base del ahorro)' : 'sin impuestos'} · comisión ${numero(Number(a.comision), 2)} % por operación`)
  if (cifras) {
    const s = cifras.seis
    L.push(`Huella del plan: ${cifras.huella || '—'} · ${cifras.desde} → ${cifras.hasta} · ${cifras.operaciones} operaciones de la estrategia · ${cifras.ordenes ?? '—'} órdenes`)
    L.push(`Has aportado ${euros(s.aportado)} · tienes al final ${euros(s.final)} (ganancia neta ${euros(s.ganancia)}) · peor caída ${pct(s.caidaPct)} (${s.caidaPctPico} → ${s.caidaPctValle}) y ${euros(s.caidaEuros)} (${s.caidaEurosPico} → ${s.caidaEurosValle})`)
    L.push(`CAGR de la estrategia (TWR) ${pct(s.twr)} · rentabilidad de tu dinero (TIR) ${pct(s.tir)} · impuestos ${euros(s.impuestos)} · comisiones ${euros(s.costes)}`)
    L.push('Tu plan frente a las alternativas (final · CAGR de la estrategia · TIR · peor caída · impuestos · comisiones):')
    for (const x of cifras.alternativas) L.push(`  ${x.nombre}: ${euros(x.final)} · ${pct(x.twr)} · ${pct(x.tir)} · ${pct(x.caida)} · ${euros(x.impuestos)} · ${euros(x.costes)}`)
    L.push(`¿Es estable? ${cifras.tramos.map(t => `${t.nombre}: CAGR ${pct(t.cagr)}, el ocioso añadió ${puntos(t.ocioso)}`).join(' · ')}`)
    L.push(`Peores caídas de la estrategia sola (pico → valle → recuperación: caída · ocioso): ${cifras.caidas.map(c => `${c.pico} → ${c.valle} → ${c.recuperacion || 'sin recuperar'}: ${pct(c.caida)} · ${pct(c.ocioso)}`).join('; ') || 'ninguna'}`)
    L.push(fraseCaidas(cifras, a.ocioso))
  } else L.push('Resultado: todavía sin calcular.')
  if (plan) L.push(`Plan (formato 1): ${JSON.stringify(plan)}`)
  return L.join('\n')
}

// ── Recalcular solo ──
// pide(x): espera `espera` ms desde la última petición y entonces calcula; si llega otra mientras calcula, solo cuenta la última
// (la respuesta de una anterior se descarta). alEstado recibe { calculando: true } al pedir y { calculando: false, resultado | error }.
export function creaCalculador({ espera = ESPERA_CALCULO, calcula, alEstado }) {
  let reloj = null, n = 0
  return {
    pide(x) {
      clearTimeout(reloj)
      const id = ++n
      alEstado({ calculando: true })
      reloj = setTimeout(async () => {
        try { const r = await calcula(x); if (id === n) alEstado({ calculando: false, resultado: r }) } catch (e) { if (id === n) alEstado({ calculando: false, error: e?.message || String(e) }) }
      }, espera)
    },
    cancela() { clearTimeout(reloj); n++ },
  }
}
