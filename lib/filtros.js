// ═══════════════════════════════════════════════════════════════════════════════
// FILTROS — catálogo, estado persistido y traducción al contrato del backend
// ═══════════════════════════════════════════════════════════════════════════════
// El estado es una LISTA de filtros añadidos, no un objeto de claves fijas. La razón está en la
// interfaz: hay que distinguir "no añadido" de "añadido pero apagado", y con un objeto de claves
// fijas eso obliga a elegir entre dos males — o la ausencia de la clave significa "no añadido", y
// entonces el saneado no puede rellenar claves que faltan (que es la protección de V9.715/V9.716),
// o la clave está siempre y entonces quitar un filtro no quita nada. Con una lista, la presencia
// significa "añadido" y `activo` significa "encendido": dos cosas distintas, dos campos distintos.

// Ámbitos. MERCADO se evalúa sobre una serie externa, igual para todos los activos; ACTIVO se
// evaluará sobre la serie del propio símbolo (aún sin filtros: llega en el commit del MACD).
export const AMBITOS = ['mercado', 'activo']

// Catálogo de tipos disponibles. Es la autoridad: lo que no está aquí no existe, y por eso un tipo
// retirado desaparece solo de las configuraciones guardadas (igual que pasó con sectorEma y el VIX).
// `fallback` reproduce el `Number(x)||N` que ya tenía cada input — incluido el de indiceEma.periodo,
// que cae a 200 aunque su default sea 10. Es una rareza previa: se conserva, no se corrige aquí.
// `prepara(f, ctx)` es la evaluación: devuelve una prueba `(i) => bool` para la barra i, o null si
// no hay serie con la que evaluar. Vive junto al resto de la definición del tipo a propósito: añadir
// un filtro nuevo debe ser tocar UNA entrada, no una entrada aquí y tres bloques en el backend.
// Convención fail-open, la de siempre: sin dato para el indicador, el filtro PERMITE.
export const FILTROS_CATALOGO = {
  indiceEma: {
    label: 'Índice > EMA',
    ambitos: ['mercado'],
    intervaloConfigurable: true,
    params: { ticker: '^GSPC', periodo: 10, intervalo: 'diario' },
    campos: [
      { k: 'ticker',  etiqueta: 'Ticker', tipo: 'texto',  ancho: 60 },
      { k: 'periodo', etiqueta: 'EMA',    tipo: 'numero', ancho: 50, min: 2, max: 500, fallback: 200 },
    ],
    prepara(f, ctx) {
      const src = ctx.serieDe(f)
      if (!src) return null
      const { closes, ema } = ctx.alineado(src, f.params?.intervalo === 'semanal', Math.max(1, f.params?.periodo ?? 200))
      return i => { const c = closes?.[i], e = ema?.[i]; return c == null || e == null ? true : c >= e }
    },
  },
  cruceEma: {
    label: 'Cruce EMA (R>L)',
    ambitos: ['mercado'],
    intervaloConfigurable: true,
    params: { ticker: '^GSPC', periodoR: 10, periodoL: 11, intervalo: 'diario' },
    campos: [
      { k: 'ticker',   etiqueta: 'Ticker', tipo: 'texto',  ancho: 60 },
      { k: 'periodoR', etiqueta: 'R',      tipo: 'numero', ancho: 42, min: 2, max: 500, fallback: 10 },
      { k: 'periodoL', etiqueta: 'L',      tipo: 'numero', ancho: 42, min: 2, max: 500, fallback: 11 },
    ],
    prepara(f, ctx) {
      const src = ctx.serieDe(f)
      if (!src) return null
      const sem = f.params?.intervalo === 'semanal'
      const R = ctx.alineado(src, sem, Math.max(1, f.params?.periodoR ?? 10))
      const L = ctx.alineado(src, sem, Math.max(1, f.params?.periodoL ?? 11))
      return i => { const er = R.ema?.[i], el = L.ema?.[i]; return er == null || el == null ? true : er > el }
    },
  },
}

// No se admiten dos instancias del mismo tipo en el mismo ámbito, así que (tipo, ámbito) ya es
// identificador único y estable. No hace falta generar ids ni arrastrarlos entre sesiones.
export const idDe = (tipo, ambito) => `${tipo}@${ambito}`

export const nuevoFiltro = (tipo, ambito, activo = true) => ({
  id: idDe(tipo, ambito),
  tipo,
  ambito,
  activo,
  params: { ...FILTROS_CATALOGO[tipo].params },
})

// Estado inicial: los dos filtros de siempre, en el ámbito de mercado, con indiceEma encendido y
// cruceEma apagado. Reproduce exactamente lo que veía una instalación nueva antes de este cambio.
export const FILTROS_DEFAULT = [
  nuevoFiltro('indiceEma', 'mercado', true),
  nuevoFiltro('cruceEma',  'mercado', false),
]

export const FILTROS_LS_KEY = 'v50_filtros'
// v2: la estructura pasó de objeto de claves fijas a lista con ámbito. Una configuración v1 se
// descarta entera; no se migra.
export const FILTROS_LS_VERSION = 2

// Sanea la lista guardada. Descarta lo que el catálogo no reconoce, completa los params que falten
// y deduplica. Devuelve siempre objetos nuevos, así que ni FILTROS_DEFAULT ni FILTROS_CATALOGO
// pueden acabar compartidos por referencia ni mutados.
// Un array vacío es legítimo (el usuario quitó todos los filtros) y se respeta; solo un valor que
// NO sea array se considera inválido y cae a los defaults.
export function mergeFiltros(raw) {
  if (!Array.isArray(raw)) return FILTROS_DEFAULT.map(f => ({ ...f, params: { ...f.params } }))
  const vistos = new Set()
  const out = []
  for (const f of raw) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue
    const def = FILTROS_CATALOGO[f.tipo]
    if (!def) continue                                    // tipo retirado o desconocido
    if (!def.ambitos.includes(f.ambito)) continue          // ámbito no permitido para ese tipo
    const id = idDe(f.tipo, f.ambito)
    if (vistos.has(id)) continue                           // duplicado por (tipo, ámbito) — y por id
    vistos.add(id)
    out.push({
      id,
      tipo: f.tipo,
      ambito: f.ambito,
      activo: !!f.activo,
      params: { ...def.params, ...(f.params && typeof f.params === 'object' ? f.params : {}) },
    })
  }
  return out
}

export const filtrosDe    = (lista, ambito) => (lista || []).filter(f => f.ambito === ambito)
export const hayFiltroActivo = (lista, ambito) => filtrosDe(lista, ambito).some(f => f.activo)
export const cuentaActivos   = (lista, ambito) => filtrosDe(lista, ambito).filter(f => f.activo).length

// Tipos que aún se pueden añadir a un ámbito: los que lo admiten y no están ya puestos.
export const tiposDisponibles = (lista, ambito) =>
  Object.keys(FILTROS_CATALOGO).filter(t =>
    FILTROS_CATALOGO[t].ambitos.includes(ambito) &&
    !(lista || []).some(f => f.tipo === t && f.ambito === ambito))

// ── Contrato con el backend ───────────────────────────────────────────────────
// El backend recibe ya la LISTA, así que no hay traducción: el cliente envía filtrosSafe tal cual.
// Lo que sigue es lo que el backend usa para interpretarla.

export const filtrosActivos = (lista) => (lista || []).filter(f => f?.activo && FILTROS_CATALOGO[f.tipo])
export const hayFiltrosActivos = (lista) => filtrosActivos(lista).length > 0

// Convierte la forma PLANA antigua ({indiceEma:{activo,…}}) en lista. Solo por tolerancia: una
// pestaña abierta con el cliente anterior puede seguir enviándola durante un rato tras desplegar.
// Sin esto, esa pestaña dejaría de filtrar en silencio, que es justo lo que hay que evitar.
export function desdeFormaPlana(obj) {
  const out = []
  for (const tipo of Object.keys(FILTROS_CATALOGO)) {
    const v = obj?.[tipo]
    if (!v || typeof v !== 'object') continue
    const { activo, ...params } = v
    out.push({ id: idDe(tipo, 'mercado'), tipo, ambito: 'mercado', activo: !!activo, params })
  }
  return out
}

// Punto de entrada del backend. Tolera cualquier forma sin fallar: lista → saneada; forma plana
// antigua → convertida; cualquier otra cosa → lista vacía, y entonces no se filtra nada (que es la
// convención de siempre: lo que no se reconoce, no filtra).
export function normalizaFiltrosEntrada(raw) {
  if (Array.isArray(raw)) return mergeFiltros(raw)
  if (raw && typeof raw === 'object') return mergeFiltros(desdeFormaPlana(raw))
  return []
}

// Claves (ticker:intervalo) de las series EXTERNAS que hay que descargar. Solo las de ámbito
// mercado: los de ámbito activo se evalúan sobre la serie del propio símbolo, ya cargada.
// Los tokens de intervalo los pone quien llama porque no coinciden entre endpoints: datos.js usa
// 'w'/'d' y multibacktest.js '1wk'/'1d'.
// ^GSPC diario ya viene descargado aparte, así que solo se pide si el ticker es otro o es semanal.
export function clavesAuxiliares(lista, tokenSemanal, tokenDiario) {
  const out = new Set()
  for (const f of filtrosActivos(lista)) {
    if (f.ambito !== 'mercado') continue
    const t = f.params?.ticker
    if (!t) continue
    const iv = f.params?.intervalo === 'semanal' ? tokenSemanal : tokenDiario
    if (t !== '^GSPC' || iv === tokenSemanal) out.add(`${t}:${iv}`)
  }
  return out
}

// Construye el mapa fecha → ¿entrada permitida? Es el AND de todos los filtros activos, de los dos
// ámbitos, exactamente como antes lo era de los dos filtros fijos. Un filtro sin serie con la que
// evaluar no participa (fail-open).
// Quien llama aporta lo que depende de su endpoint:
//   assetBars      barras del propio activo (serie de los filtros de ámbito ACTIVO)
//   assetDates     sus fechas, que son las claves del mapa
//   resolveMercado (ticker, semanal) → datos crudos de la serie externa ya descargada
//   alineado       (datos, semanal, periodo) → {closes, ema} proyectados sobre assetDates
export function construirFiltroActivoMap(lista, { assetBars, assetDates, resolveMercado, alineado }) {
  const ctx = {
    serieDe: (f) => f.ambito === 'activo'
      ? assetBars
      : resolveMercado(f.params?.ticker, f.params?.intervalo === 'semanal'),
    alineado,
  }
  const pruebas = []
  for (const f of filtrosActivos(lista)) {
    const t = FILTROS_CATALOGO[f.tipo].prepara(f, ctx)
    if (t) pruebas.push(t)
  }
  const map = {}
  for (let i = 0; i < assetDates.length; i++) {
    let ok = true
    for (const t of pruebas) { if (!t(i)) { ok = false; break } }
    map[assetDates[i]] = ok
  }
  return map
}

// ── Persistencia ──────────────────────────────────────────────────────────────
// Clave propia, fuera de v50_settings: SettingsModal toma una instantánea al montarse y guarda esa
// instantánea entera, así que un dato que se escribe a cada clic se perdería. Sin sincronización
// remota mientras la estructura siga moviéndose.
export function guardarFiltros(lista) {
  try { localStorage.setItem(FILTROS_LS_KEY, JSON.stringify({ v: FILTROS_LS_VERSION, data: lista })) } catch (_) {}
}

// Lectura síncrona en el montaje. Descarta sin migrar si la marca de versión no es la esperada o si
// el contenido no tiene la forma esperada. `restaurado` distingue "venía de otra sesión" de
// "defaults de fábrica": solo lo primero despliega una sección.
// En SSR no existe localStorage: el acceso lanza, lo recoge el catch y se arranca con defaults.
export function loadFiltros() {
  const vacio = { filtros: mergeFiltros(null), restaurado: false }
  try {
    const raw = localStorage.getItem(FILTROS_LS_KEY)
    if (!raw) return vacio
    const parsed = JSON.parse(raw)
    if (parsed?.v !== FILTROS_LS_VERSION) return vacio
    if (!Array.isArray(parsed.data)) return vacio
    return { filtros: mergeFiltros(parsed.data), restaurado: true }
  } catch (_) { return vacio }
}
