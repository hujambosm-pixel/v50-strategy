// lib/replay/vistaReplay.js — el Replay con varios valores cuya lista es una VISTA DEL SCREENER «en esa fecha» (paso 5 de «la lista del
// screener de cada día», docs/builder.md §270; decidido con Sergi el 25/11: opción B, la lista de cada día con lo que se sabía ese día).
// Lógica PURA.
//
// fuente = { tipo: 'vista', id, nombre, vista, semanas: [[lunes, [símbolos]], …] (ordenadas), noSeAplican: [ids de filtros],
//           seAplicaDesde: { id: lunes } } (de pages/api/replay-vista.js: el PEG esperado solo se aplica desde junio de 2024)
//   · La lista de un día = la del ÚLTIMO lunes ≤ ese día (la del lunes se decide con el cierre del viernes anterior: screener_fotos).
//   · Antes del primer lunes: vacía.
//   · Los valores del Replay (los que se cargan) = TODOS los que alguna semana estuvieron en la lista (unionSemanas).
//   · En la rejilla: los de la lista de hoy + los que tienen una posición o una orden viva (aunque hayan salido de la lista).
//   · «Ejecutar solo» y «Señal ⏭»: solo las señales de un valor que ese día está en la lista (filtraSenalesVista). Tus órdenes a mano
//     sí se pueden poner en cualquier valor que se vea.
// Ejemplo: semanas [[«2024-01-08», [A, B]], [«2024-01-15», [B, C]]] → el miércoles 10/01: A y B; el 16/01: B y C (entra C, sale A).
// Una señal de A el 16/01 ya no cuenta; si A tenía una posición abierta, sigue en la rejilla hasta que se cierre.

export const MAX_VALORES_VISTA = 150

// El aviso de los filtros que no se aplican en todo el tramo. nombreDe(id) → nombre del filtro; hoy (opcional) = el día del Replay:
// con hoy, solo los que AÚN no se aplican ese día. Ejemplo: PEG esperado desde el 10/06/2024 →
// «PEG esperado: solo desde el 10/06/2024 (antes no se aplica)»; con hoy = 01/03/2025 → nada.
const dma = (f) => f.split('-').reverse().join('/')
export function avisoNoSeAplica(noSeAplican, seAplicaDesde, nombreDe, hoy = null) {
  const partes = []
  for (const id of noSeAplican || []) {
    const desde = seAplicaDesde?.[id]
    if (hoy && desde && hoy >= desde) continue
    partes.push(desde ? `${nombreDe(id)}: solo desde el ${dma(desde)} (antes no se aplica)` : `${nombreDe(id)}: no se aplica`)
  }
  return partes.join(' · ')
}

// La posición (índice) de la semana que vale el día `fecha`, o −1.
export function semanaDe(semanas, fecha) {
  const l = semanas || []
  let lo = 0, hi = l.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (l[m][0] <= fecha) lo = m + 1; else hi = m }
  return lo - 1
}

export function listaEnDia(fuente, fecha) {
  const i = semanaDe(fuente?.semanas, fecha)
  return i >= 0 ? fuente.semanas[i][1] : []
}

// Los que entran y salen esa semana (frente a la anterior) y el lunes que manda.
export function cambiosEnDia(fuente, fecha) {
  const l = fuente?.semanas || [], i = semanaDe(l, fecha)
  if (i < 0) return { lunes: null, lista: [], entran: [], salen: [] }
  const ahora = l[i][1], antes = i > 0 ? new Set(l[i - 1][1]) : null, set = new Set(ahora)
  return { lunes: l[i][0], lista: ahora, entran: antes ? ahora.filter(s => !antes.has(s)) : [], salen: antes ? [...antes].filter(s => !set.has(s)) : [] }
}

// Todos los símbolos que alguna semana (desde `desde`) están en la lista, ordenados.
export function unionSemanas(semanas, desde = '') {
  const l = semanas || [], i0 = Math.max(0, semanaDe(l, desde))
  const s = new Set()
  for (let i = i0; i < l.length; i++) for (const x of l[i][1]) s.add(x)
  return [...s].sort()
}

// Solo las entradas de cada valor en días en que está en la lista (las salidas, todas: venden lo que haya).
export function filtraSenalesVista(senales, fuente) {
  if (!senales || fuente?.tipo !== 'vista') return senales
  const out = {}
  for (const [s, v] of Object.entries(senales)) out[s] = { ...v, entradas: (v.entradas || []).filter(d => listaEnDia(fuente, d).includes(s)) }
  return out
}

// Los que se ven en la rejilla el día `fecha`: los de la lista + los que tienen posición u orden viva, sin repetir.
export function visiblesVista(fuente, fecha, r, valores = []) {
  if (fuente?.tipo !== 'vista') return valores
  const dentro = new Set(valores)
  const s = new Set(listaEnDia(fuente, fecha).filter(x => dentro.has(x)))
  for (const k of Object.keys(r?.posiciones || {})) s.add(k)
  for (const o of r?.ordenesVivas || []) if (o.simbolo) s.add(o.simbolo)
  return valores.filter(x => s.has(x))
}

// El texto de la cabecera: «Vista «X» · semana del 15/01/2024: 12 valores · entran C · salen A».
const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
export function textoVista(fuente, fecha) {
  const c = cambiosEnDia(fuente, fecha)
  if (!c.lunes) return `Vista «${fuente?.nombre || ''}» · aún sin lista`
  const lista = (l) => l.length > 6 ? `${l.slice(0, 6).join(', ')} y ${l.length - 6} más` : l.join(', ')
  return `Vista «${fuente?.nombre || ''}» · semana del ${fmt(c.lunes)}: ${c.lista.length} ${c.lista.length === 1 ? 'valor' : 'valores'}` +
    (c.entran.length ? ` · entran ${lista(c.entran)}` : '') + (c.salen.length ? ` · salen ${lista(c.salen)}` : '')
}
