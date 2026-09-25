// lib/indicadores.js — indicadores DEL USUARIO: catálogo, valores por defecto y persistencia.
//
// QUÉ HAY AQUÍ Y QUÉ NO. Aquí están los METADATOS —cómo se llama cada tipo, qué parámetros admite, con
// qué valores arranca y cómo se rotula—, que los necesitan la lista de la interfaz y el guardado. El
// CÁLCULO está en components/CandleChart.js (TIPOS_INDICADOR), porque vive pegado al dibujo y a las
// funciones de lib/backtester.js. Lo único que comparten los dos sitios es la cadena `tipo`, así que al
// añadir un tipo hay que tocar los dos; está anotado en ambos.
//
// NADA DE ESTO TIENE QUE VER CON LOS INDICADORES DE LA ESTRATEGIA. Esos llegan calculados dentro de las
// barras (d.macdLine, d.rsiLine, d.bbUpper…), pueden estar en otro intervalo y no se configuran desde
// aquí.

// ── Paleta ──────────────────────────────────────────────────────────────────
// Elegida para NO chocar con la de las estrategias, que ya usa #ffd166, #ff4d6d, #9C27B0, #2196F3,
// #FF6D00, #2962ff, #7E57C2, #f0c040, #26a69a, #ef5350 y #FFB300. Si un indicador del usuario saliera
// del mismo color que uno de la estrategia, el trazo discontinuo sería lo único que los separaría.
export const PALETA_INDICADORES = [
  '#00d4ff', // cian
  '#00e5a0', // verde
  '#ff6ec7', // rosa
  '#a8e10c', // lima
  '#ff8c42', // naranja
  '#b388ff', // violeta claro
  '#4dd0e1', // turquesa
  '#e0e0e0', // gris claro
]

// Cuántas medias caben en un indicador de tipo 'medias'. Cinco es el tope del encargo y también lo que
// cabe en un modal sin que haya que desplazarse.
export const MAX_MEDIAS = 5

// ── Catálogo ────────────────────────────────────────────────────────────────
// `destino` tiene que coincidir con el de TIPOS_INDICADOR de CandleChart.js.
// `params` describe qué es configurable y con qué límites, y lo usan tanto el modal como el saneado.
export const CATALOGO_INDICADORES = {
  // ── Medias móviles: UN indicador con hasta cinco líneas ──────────────────
  // Sustituye a los tipos 'ema' y 'sma' sueltos. Quien quiera cinco medias tenía cinco filas en la lista
  // y cinco modales; ahora es una fila y un modal.
  //
  // ESTO NO ENCAJABA EN EL ESQUEMA DE PARÁMETROS, que solo sabía describir escalares —entero, número,
  // color, bool—. Se añade el tipo de parámetro 'medias', que el modal traduce a cinco bloques. Es la
  // única forma de que los campos sigan saliendo del catálogo en vez de escribirse a mano en el modal.
  medias: {
    nombre: 'Medias móviles', destino: 'precio',
    // Una sola activa al añadir, EMA 20. Las otras cuatro esperan apagadas con periodos habituales, para
    // que encenderlas sea un clic y no rellenar un formulario.
    defectos: {
      medias: [
        { activa: true,  tipoMA: 'ema', periodo: 20,  color: '#00d4ff', grosor: 2, discontinuo: true, enLeyenda: true },
        { activa: false, tipoMA: 'ema', periodo: 50,  color: '#00e5a0', grosor: 2, discontinuo: true, enLeyenda: true },
        { activa: false, tipoMA: 'sma', periodo: 100, color: '#ff6ec7', grosor: 2, discontinuo: true, enLeyenda: false },
        { activa: false, tipoMA: 'sma', periodo: 200, color: '#a8e10c', grosor: 2, discontinuo: true, enLeyenda: false },
        { activa: false, tipoMA: 'ema', periodo: 9,   color: '#ff8c42', grosor: 2, discontinuo: true, enLeyenda: false },
      ],
    },
    params: [
      { clave: 'medias', etiqueta: 'Medias', tipo: 'medias', max: MAX_MEDIAS },
    ],
    rotulo: (i) => `Medias · ${(i.medias || []).filter(m => m?.activa).length}`,
  },
  bollinger: {
    nombre: 'Bollinger', destino: 'precio',
    defectos: { periodo: 20, desviaciones: 2, grosor: 2, discontinuo: true, enLeyenda: true },
    params: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'entero', min: 2, max: 2000 },
      { clave: 'desviaciones', etiqueta: 'Desviaciones', tipo: 'numero', min: 0.1, max: 10 },
      { clave: 'color', etiqueta: 'Color', tipo: 'color' },
      { clave: 'grosor', etiqueta: 'Grosor', tipo: 'entero', min: 1, max: 4 },
      { clave: 'discontinuo', etiqueta: 'Trazo discontinuo', tipo: 'bool' },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => `BB ${i.periodo}, ${i.desviaciones}`,
  },
  rsi: {
    nombre: 'RSI', destino: 'rsi',
    defectos: { periodo: 14, sobrecompra: 70, sobreventa: 30, grosor: 2, enLeyenda: false },
    params: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'entero', min: 2, max: 500 },
      { clave: 'color', etiqueta: 'Color', tipo: 'color' },
      { clave: 'sobrecompra', etiqueta: 'Sobrecompra', tipo: 'entero', min: 1, max: 99 },
      { clave: 'sobreventa', etiqueta: 'Sobreventa', tipo: 'entero', min: 1, max: 99 },
      { clave: 'grosor', etiqueta: 'Grosor', tipo: 'entero', min: 1, max: 4 },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => `RSI ${i.periodo}`,
  },
  macd: {
    nombre: 'MACD', destino: 'macd',
    defectos: { rapido: 12, lento: 26, senal: 9, colorSenal: '#ff8c42', grosor: 2, enLeyenda: false },
    params: [
      { clave: 'rapido', etiqueta: 'Rápido', tipo: 'entero', min: 1, max: 500 },
      { clave: 'lento', etiqueta: 'Lento', tipo: 'entero', min: 2, max: 1000 },
      { clave: 'senal', etiqueta: 'Señal', tipo: 'entero', min: 1, max: 500 },
      { clave: 'color', etiqueta: 'Color de la línea', tipo: 'color' },
      { clave: 'colorSenal', etiqueta: 'Color de la señal', tipo: 'color' },
      { clave: 'grosor', etiqueta: 'Grosor', tipo: 'entero', min: 1, max: 4 },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => `MACD ${i.rapido}/${i.lento}/${i.senal}`,
  },
  volumen: {
    nombre: 'Volumen', destino: 'volumen',
    // `media` apagada por defecto: quien añade "Volumen" quiere ver las barras; la media es un extra.
    defectos: { media: false, periodo: 20, grosor: 2, enLeyenda: false,
      colorSube: '#26a69a80', colorBaja: '#ef535080' },
    params: [
      { clave: 'colorSube', etiqueta: 'Barras al alza', tipo: 'color' },
      { clave: 'colorBaja', etiqueta: 'Barras a la baja', tipo: 'color' },
      { clave: 'media', etiqueta: 'Media móvil', tipo: 'bool' },
      { clave: 'periodo', etiqueta: 'Periodo de la media', tipo: 'entero', min: 1, max: 2000 },
      { clave: 'color', etiqueta: 'Color de la media', tipo: 'color' },
      { clave: 'grosor', etiqueta: 'Grosor de la media', tipo: 'entero', min: 1, max: 4 },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => i.media ? `Volumen · MA ${i.periodo}` : 'Volumen',
  },
}

export const TIPOS_DISPONIBLES = Object.keys(CATALOGO_INDICADORES)

// Rótulo de una fila de la lista: "EMA 50", "BB 20, 2", "MACD 12/26/9". Si el tipo no está en el
// catálogo devuelve algo legible en vez de reventar.
export function rotuloIndicador(ind) {
  const c = CATALOGO_INDICADORES[ind?.tipo]
  if (!c) return String(ind?.tipo || '?')
  try { return c.rotulo(ind) } catch (_) { return c.nombre }
}

// Indicador nuevo con sus valores por defecto. El color sale de la paleta, rotando por la posición, para
// que dos indicadores seguidos no nazcan del mismo color.
// Los defectos llevan ahora un ARRAY (las medias), así que se copian en profundidad: compartir la misma
// referencia entre dos indicadores haría que tocar uno tocara el otro.
const copia = (v) => JSON.parse(JSON.stringify(v))

export function nuevoIndicador(tipo, indice = 0) {
  const c = CATALOGO_INDICADORES[tipo]
  if (!c) return null
  return {
    id: 'ind_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    tipo,
    color: PALETA_INDICADORES[indice % PALETA_INDICADORES.length],
    visible: true,
    ...copia(c.defectos),
  }
}

// ── Validación ──────────────────────────────────────────────────────────────
// Devuelve el primer problema encontrado, o null si todo está bien. La usa el modal para avisar en vez
// de dejar pasar un valor que rompa el cálculo: un periodo 0 o negativo devuelve series vacías, y un
// MACD con el rápido por encima del lento es un indicador al revés.
export function validaIndicador(ind) {
  const c = CATALOGO_INDICADORES[ind?.tipo]
  if (!c) return 'Tipo de indicador desconocido.'
  for (const p of c.params) {
    if (p.tipo !== 'entero' && p.tipo !== 'numero') continue
    const v = Number(ind[p.clave])
    if (!Number.isFinite(v)) return `${p.etiqueta}: escribe un número.`
    if (p.tipo === 'entero' && !Number.isInteger(v)) return `${p.etiqueta}: tiene que ser un número entero.`
    if (v < p.min || v > p.max) return `${p.etiqueta}: entre ${p.min} y ${p.max}.`
  }
  if (ind.tipo === 'medias') {
    const medias = Array.isArray(ind.medias) ? ind.medias : []
    if (!medias.some(m => m?.activa)) return 'Enciende al menos una media.'
    for (let k = 0; k < medias.length; k++) {
      const m = medias[k]
      if (!m?.activa) continue
      const v = Number(m.periodo)
      if (!Number.isFinite(v) || !Number.isInteger(v)) return `Media ${k + 1}: el periodo tiene que ser un número entero.`
      if (v < 1 || v > 2000) return `Media ${k + 1}: el periodo, entre 1 y 2000.`
    }
    return null
  }
  if (ind.tipo === 'macd' && Number(ind.rapido) >= Number(ind.lento)) {
    return 'El periodo rápido tiene que ser menor que el lento.'
  }
  if (ind.tipo === 'rsi' && Number(ind.sobreventa) >= Number(ind.sobrecompra)) {
    return 'La sobreventa tiene que ser menor que la sobrecompra.'
  }
  return null
}

// Sanea una lista venida de localStorage: descarta lo que el catálogo no reconoce y completa lo que
// falte con los valores por defecto. Así una versión antigua sin un campo nuevo no rompe nada.
// MIGRACIÓN del tipo 'volumen'. Antes era "media de volumen" y dibujaba SOLO la media, así que no tenía
// campo `media`. Ahora dibuja barras, con la media como extra apagado por defecto. Un indicador guardado
// con la versión anterior se reconoce porque le falta `media`: se le pone en true para que siga viendo lo
// que veía, y se le añaden las barras, que es lo que el tipo significa ahora. No se descarta nada: quien
// lo tenía puesto con un periodo a medida no lo pierde.
// ── Migración de lista ──────────────────────────────────────────────────────
// Los tipos 'ema' y 'sma' sueltos desaparecen: pasan a ser líneas dentro de UN indicador 'medias'.
// Se conserva de cada uno su periodo, su color, su grosor, su trazo y si salía en la barra; su `visible`
// pasa a ser el `activa` de la línea. El indicador resultante queda visible si lo estaba cualquiera de
// ellos —ocultar todas se hace desde la fila—, y se coloca en el lugar del PRIMERO, para no reordenar la
// lista de quien la tuviera puesta a su gusto.
// SI HAY MÁS DE CINCO, se conservan las cinco primeras y las demás se descartan: el tipo no admite más y
// callárselo sería peor que decirlo, así que queda anotado en la consola.
function migraLista(lista) {
  if (!Array.isArray(lista)) return []
  const sueltas = lista.filter(x => x?.tipo === 'ema' || x?.tipo === 'sma')
  if (!sueltas.length) return lista
  const sobran = sueltas.length - MAX_MEDIAS
  if (sobran > 0) console.warn(`[indicadores] ${sueltas.length} medias guardadas; se conservan ${MAX_MEDIAS} y se descartan ${sobran}.`)
  const medias = sueltas.slice(0, MAX_MEDIAS).map(x => ({
    activa: x.visible !== false,
    tipoMA: x.tipo === 'sma' ? 'sma' : 'ema',
    periodo: Number(x.periodo) || 20,
    color: x.color || PALETA_INDICADORES[0],
    grosor: Number(x.grosor) || 2,
    discontinuo: x.discontinuo !== false,
    enLeyenda: x.enLeyenda !== false,
  }))
  // Completar hasta cinco con las que quedan apagadas por defecto, para que el modal siempre tenga cinco
  // bloques y no haya que tratar el caso de "faltan".
  const plantilla = CATALOGO_INDICADORES.medias.defectos.medias
  while (medias.length < MAX_MEDIAS) medias.push({ ...plantilla[medias.length], activa: false })
  const fundido = {
    id: sueltas[0].id || ('ind_mig_' + Math.random().toString(36).slice(2, 7)),
    tipo: 'medias',
    color: sueltas[0].color || PALETA_INDICADORES[0],
    visible: sueltas.some(x => x.visible !== false),
    medias,
  }
  const out = []
  let puesto = false
  for (const x of lista) {
    if (x?.tipo === 'ema' || x?.tipo === 'sma') {
      if (!puesto) { out.push(fundido); puesto = true }
      continue
    }
    out.push(x)
  }
  return out
}

function migra(ind) {
  if (ind?.tipo !== 'volumen') return ind
  if (ind.media !== undefined) return ind
  return { ...ind, media: true }
}

export function saneaIndicadores(lista) {
  if (!Array.isArray(lista)) return []
  const out = []
  migraLista(lista).forEach((crudo, i) => {
    const ind = migra(crudo)
    const c = CATALOGO_INDICADORES[ind?.tipo]
    if (!c) return
    out.push({
      ...copia(c.defectos),
      color: PALETA_INDICADORES[i % PALETA_INDICADORES.length],
      ...ind,
      id: ind.id || ('ind_' + i + '_' + Math.random().toString(36).slice(2, 7)),
      visible: ind.visible !== false,
    })
  })
  return out
}

// ── Persistencia ────────────────────────────────────────────────────────────
// Clave y versión propias, al estilo de lib/filtros.js, y por el mismo motivo: v50_settings lo guarda
// SettingsModal a partir de una instantánea que toma al abrirse, así que un dato que se escribe a cada
// clic se perdería en cuanto alguien abriera los ajustes.
// Los indicadores son GLOBALES: los mismos en cualquier activo. No se guardan por símbolo.
export const IND_LS_KEY = 'v50_indicadores'
export const IND_LS_VERSION = 1

export function guardarIndicadores(lista) {
  try { localStorage.setItem(IND_LS_KEY, JSON.stringify({ v: IND_LS_VERSION, data: lista })) } catch (_) {}
}

// Lectura síncrona. Descarta sin migrar si la marca de versión no cuadra o si el contenido no tiene la
// forma esperada. En SSR no existe localStorage: el acceso lanza, lo recoge el catch y se arranca vacío.
export function cargarIndicadores() {
  try {
    const raw = localStorage.getItem(IND_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (parsed?.v !== IND_LS_VERSION) return []
    if (!Array.isArray(parsed.data)) return []
    return saneaIndicadores(parsed.data)
  } catch (_) { return [] }
}
