// lib/planes/vistaUniverso.js — una VISTA DEL SCREENER como valores de un plan (docs/builder.md §274).
//
// El universo del bloque se guarda como 'vista:<id>' (el id de public.screener_vistas). Cada LUNES, los valores que se pueden comprar
// son los que pasaban la vista con lo que se sabía ese día (las fotos semanales: /api/replay-vista da [[lunes, [símbolos]], …]).
// Decisión de Sergi (27/11): la ESTRATEGIA decide cuándo comprar y vender; la lista de cada semana solo dice qué valores están
// disponibles. Lo comprado se queda aunque el valor salga de la lista (lo vende la estrategia). La lista forma parte de la SEÑAL
// (como los filtros del plan, §150): una señal «de estado» compra en cuanto el valor entra en la lista si sigue cumpliéndose.
//
// La máscara tiene la forma del universo del Nasdaq-100 ({ símbolo: [[desde, hasta), …] }, lib/universoDinamico.js admiteEntrada):
// el tramo de cada semana va de su lunes al lunes de la foto siguiente; el de la última foto, 7 días.

export const PREFIJO_VISTA = 'vista:'
export const esUniversoVista = (v) => typeof v === 'string' && /^vista:\d+$/.test(v)
export const idDeVista = (v) => esUniversoVista(v) ? Number(v.slice(PREFIJO_VISTA.length)) : null
export const universoDeVista = (id) => `${PREFIJO_VISTA}${id}`
// Como mucho, valores DISTINTOS en el periodo (cada uno es una descarga de velas y una simulación): el mismo límite del Replay.
export const MAX_VALORES_PLAN_VISTA = 150

const ISO = /^\d{4}-\d{2}-\d{2}$/
const masDias = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export const fechaCorta = (f) => String(f || '').split('-').reverse().join('/')

// semanas: [[lunes, [símbolos]], …] en orden de fecha. desde / hasta: el periodo del plan ('aaaa-mm-dd', los dos incluidos).
// Devuelve { mascara, simbolos (ordenados), semanas: cuántas caen en el periodo, primera, ultima (lunes de la primera y última foto) }.
export function universoDeSemanas(semanas, desde, hasta) {
  const lista = (Array.isArray(semanas) ? semanas : []).filter(s => Array.isArray(s) && ISO.test(s[0]) && Array.isArray(s[1]))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const mascara = {}
  let enPeriodo = 0
  lista.forEach(([lunes, simbolos], k) => {
    const fin = lista[k + 1]?.[0] ?? masDias(lunes, 7)
    if (fin <= desde || lunes > hasta) return
    enPeriodo++
    for (const s of new Set(simbolos)) {
      if (typeof s !== 'string' || !s) continue
      const t = (mascara[s] ||= [])
      const u = t[t.length - 1]
      if (u && u[1] === lunes) u[1] = fin
      else t.push([lunes, fin])
    }
  })
  const simbolos = Object.keys(mascara).sort()
  return { mascara: Object.fromEntries(simbolos.map(s => [s, mascara[s]])), simbolos, semanas: enPeriodo,
    primera: lista[0]?.[0] ?? null, ultima: lista[lista.length - 1]?.[0] ?? null }
}

// Lo que dice el plan con una vista, con la forma de estadoUniversoMc (lib/universoMc.js): { activo, motivo, universo }.
//   datos: lo de /api/replay-vista ({ semanas, primera, ultima }) o { error }; undefined mientras se lee.
//   nombre: el de la vista (para los textos). desde / hasta: el periodo del plan.
export function estadoUniversoVista({ datos, nombre = 'la vista', desde, hasta, conEstrategia = true }) {
  const no = (motivo) => ({ activo: false, motivo, universo: null })
  if (!datos) return no(`Leyendo la vista del screener «${nombre}»…`)
  if (datos.error) return no(datos.error)
  if (!desde || !hasta) return no('Elige el periodo en «Tu dinero».')
  const u = universoDeSemanas(datos.semanas, desde, hasta)
  if (u.primera && desde < u.primera) return no(`las fotos del screener empiezan el lunes ${fechaCorta(u.primera)}: empieza el plan ese día o después.`)
  if (!u.simbolos.length) return no(`ningún valor pasa la vista «${nombre}» en ese periodo.`)
  if (u.simbolos.length > MAX_VALORES_PLAN_VISTA) return no(`en ese periodo pasan la vista ${u.simbolos.length} valores distintos; como mucho, ${MAX_VALORES_PLAN_VISTA}: añade algún filtro o acorta el periodo.`)
  if (!conEstrategia) return no('elige una estrategia de tarjetas.')
  return { activo: true, motivo: null, universo: u }
}
