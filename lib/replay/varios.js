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
