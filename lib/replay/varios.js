// lib/replay/varios.js — el Replay con VARIOS valores (docs/builder.md §253; boceto bocetos/replay-operar-multiactivo.html, pestaña 2,
// aceptado por Sergi el 24/11). PURO. Una sola cuenta (lib/replay/motor.js ya calcula con varios valores: estado.valores); aquí, lo que
// solo hace falta con varios: el orden de la rejilla, sus páginas y el resumen por valor.

// Cuántos gráficos por página: «Grandes · 4» y «Pequeños · 6».
export const POR_PAGINA = Object.freeze({ g4: 4, g6: 6 })

// El orden de la rejilla. modo 'importante' (★, por defecto): primero los que tienen posición (3), orden viva (2) o señal hoy (1), y a
// igualdad, alfabético; 'alfa': alfabético. conSenal: Set de símbolos con señal en la vela de hoy.
export function ordenRejilla(valores, r, conSenal = new Set(), modo = 'importante') {
  const peso = (s) => (r?.posiciones?.[s] ? 3 : 0) + ((r?.ordenesVivas || []).some(o => o.simbolo === s) ? 2 : 0) + (conSenal.has(s) ? 1 : 0)
  const l = [...new Set(valores || [])].sort((a, b) => a.localeCompare(b, 'es'))
  return modo === 'importante' ? l.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b, 'es')) : l
}

// Los de una página (pagina empieza en 0) y cuántas páginas hay.
export function pagina(lista, porPagina, n) {
  const paginas = Math.max(1, Math.ceil((lista || []).length / porPagina))
  const p = Math.min(Math.max(0, n || 0), paginas - 1)
  return { valores: (lista || []).slice(p * porPagina, p * porPagina + porPagina), pagina: p, paginas }
}

// Resumen por valor: operaciones cerradas, ganadoras, resultado (con comisiones) y si hay una abierta (con su ganancia de ahora).
// De más ganancia a menos (la abierta cuenta con lo que gana ahora).
export function porValor(r, valores = []) {
  const m = {}
  const de = (s) => (m[s] ||= { simbolo: s, operaciones: 0, ganadoras: 0, resultado: 0, abierta: null })
  for (const s of valores) de(s)
  for (const o of r?.operaciones || []) { const x = de(o.simbolo); x.operaciones++; if (o.resultado > 0) x.ganadoras++; x.resultado += o.resultado }
  for (const [s, p] of Object.entries(r?.posiciones || {})) de(s).abierta = p.ganancia
  return Object.values(m).sort((a, b) => (b.resultado + (b.abierta || 0)) - (a.resultado + (a.abierta || 0)) || a.simbolo.localeCompare(b.simbolo, 'es'))
}

// Los símbolos con señal en la vela de hoy (senales = { SIM: { entradas: [fechas] } }).
export function conSenalHoy(senales, hoy) {
  const s = new Set()
  for (const [k, v] of Object.entries(senales || {})) if ((v?.entradas || []).includes(hoy)) s.add(k)
  return s
}

// La próxima vela (después de hoy) en que CUALQUIER valor da señal, o null.
export function siguienteSenalVarios(senales, hoy) {
  let m = null
  for (const v of Object.values(senales || {})) for (const d of v?.entradas || []) if (d > hoy && (m == null || d < m)) m = d
  return m
}

// La señal anterior (antes de hoy y no antes de «desde») de CUALQUIER valor, o null.
export function anteriorSenalVarios(senales, hoy, desde) {
  let m = null
  for (const v of Object.values(senales || {})) for (const d of v?.entradas || []) if (d < hoy && d >= desde && (m == null || d > m)) m = d
  return m
}

// §260: la SEÑAL con varios valores puede ser una estrategia de tarjetas, una condición del catálogo o una «Condición con pasos»
// (pedido por Sergi el 25/11). En la condición, las filas de «quien: 'valor'» se miran en CADA valor con sus propias velas; una fila de
// otro símbolo (p. ej. el S&P 500 o un valor de la lista puesto a mano) es la misma para todos. La ventana de la señal es la del Replay
// de un valor: se abre con el primer valor de la lista y, al aceptar, lo que se puso en ese valor pasa a ser «cada valor» (aCadaValor);
// al volver a abrirla, al revés (deCadaValor).
const SECCIONES_PASOS = ['mientras', 'paso1', 'paso2', 'anula']
function cambiaQuien(senal, de, a) {
  const fx = (fs) => (fs || []).map(f => (f && f.quien === de ? { ...f, quien: a } : f))
  if (senal?.tipo === 'condicion') return { ...senal, filas: fx(senal.filas) }
  if (senal?.tipo === 'pasos' && senal.def) {
    const d = { ...senal.def }
    for (const k of SECCIONES_PASOS) if (d[k]) d[k] = { ...d[k], filas: fx(d[k].filas) }
    return { ...senal, def: d }
  }
  return senal
}
export const aCadaValor = (senal, simbolo) => cambiaQuien(senal, String(simbolo || '').toUpperCase(), 'valor')
export const deCadaValor = (senal, simbolo) => cambiaQuien(senal, 'valor', String(simbolo || '').toUpperCase())

// Los símbolos cuyas velas hacen falta aparte de los de la lista (índices de los filtros, «Otro símbolo…»).
export function simbolosSenalVarios(senal, valores = [], tickersDe = () => []) {
  if (!senal) return []
  let l = []
  if (senal.tipo === 'condicion') l = (senal.filas || []).map(f => f?.quien)
  else if (senal.tipo === 'pasos') l = SECCIONES_PASOS.flatMap(k => (senal.def?.[k]?.filas || []).map(f => f?.quien))
  else if (senal.tipo === 'estrategia' && senal.def) l = tickersDe(senal.def)
  const dentro = new Set(valores)
  return [...new Set(l.filter(q => q && q !== 'valor' && !dentro.has(q)))]
}

// Las señales de cada valor: { SIM: { entradas: [fechas], salidas?: [fechas] } } (salidas solo con una estrategia).
// velasDe(q) → velas CERRADAS del símbolo q (los de la lista y los de simbolosSenalVarios). compras: { SIM: [{ fecha, precio }] } para
// «tu última compra» de la condición con pasos (en el motor van vacías, como en el de un valor: si no, las compras automáticas
// cambiarían sus propias señales). Un valor que falla se queda sin señales (no para a los demás).
export function senalesVarios(senal, valores = [], velasDe, { compras = {}, tickersDe = () => [], deCondicion, deEstrategia, dePasos } = {}) {
  if (!senal || !velasDe) return null
  const out = {}
  for (const s of valores) {
    const v = velasDe(s) || [], fechas = v.map(x => x.date)
    const vd = (q) => (q === 'valor' || q === s ? v : velasDe(q) || [])
    try {
      if (senal.tipo === 'condicion') out[s] = { entradas: deCondicion(senal.filas, vd, fechas) }
      else if (senal.tipo === 'pasos') out[s] = { entradas: dePasos(senal.def, vd, fechas, { simbolo: s, compras: compras[s] || [] }).senales }
      else if (senal.tipo === 'estrategia' && senal.def) {
        const referencias = Object.fromEntries(tickersDe(senal.def).map(t => [t, velasDe(t) || []]))
        const r = deEstrategia({ def: senal.def, params: senal.params || {}, velas: v, referencias })
        out[s] = { entradas: r.entradas || [], salidas: r.salidas || [] }
      } else out[s] = { entradas: [] }
    } catch (_) { out[s] = { entradas: [] } }
  }
  return out
}
