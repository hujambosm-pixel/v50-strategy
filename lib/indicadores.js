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

// ── Catálogo ────────────────────────────────────────────────────────────────
// `destino` tiene que coincidir con el de TIPOS_INDICADOR de CandleChart.js.
// `params` describe qué es configurable y con qué límites, y lo usan tanto el modal como el saneado.
export const CATALOGO_INDICADORES = {
  ema: {
    nombre: 'EMA', destino: 'precio',
    defectos: { periodo: 20, grosor: 2, discontinuo: true, enLeyenda: true },
    params: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'entero', min: 1, max: 2000 },
      { clave: 'color', etiqueta: 'Color', tipo: 'color' },
      { clave: 'grosor', etiqueta: 'Grosor', tipo: 'entero', min: 1, max: 4 },
      { clave: 'discontinuo', etiqueta: 'Trazo discontinuo', tipo: 'bool' },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => `EMA ${i.periodo}`,
  },
  sma: {
    nombre: 'SMA', destino: 'precio',
    defectos: { periodo: 20, grosor: 2, discontinuo: true, enLeyenda: true },
    params: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'entero', min: 1, max: 2000 },
      { clave: 'color', etiqueta: 'Color', tipo: 'color' },
      { clave: 'grosor', etiqueta: 'Grosor', tipo: 'entero', min: 1, max: 4 },
      { clave: 'discontinuo', etiqueta: 'Trazo discontinuo', tipo: 'bool' },
      { clave: 'enLeyenda', etiqueta: 'Valor en la barra', tipo: 'bool' },
    ],
    rotulo: (i) => `SMA ${i.periodo}`,
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
export function nuevoIndicador(tipo, indice = 0) {
  const c = CATALOGO_INDICADORES[tipo]
  if (!c) return null
  return {
    id: 'ind_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    tipo,
    color: PALETA_INDICADORES[indice % PALETA_INDICADORES.length],
    visible: true,
    ...c.defectos,
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
function migra(ind) {
  if (ind?.tipo !== 'volumen') return ind
  if (ind.media !== undefined) return ind
  return { ...ind, media: true }
}

export function saneaIndicadores(lista) {
  if (!Array.isArray(lista)) return []
  const out = []
  lista.forEach((crudo, i) => {
    const ind = migra(crudo)
    const c = CATALOGO_INDICADORES[ind?.tipo]
    if (!c) return
    out.push({
      ...c.defectos,
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
