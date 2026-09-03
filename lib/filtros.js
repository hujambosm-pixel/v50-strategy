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

// ── Traducción al contrato del backend ────────────────────────────────────────
// El backend sigue esperando la forma plana de siempre: { indiceEma:{activo,…}, cruceEma:{activo,…} }.
// Esta función es el ÚNICO puente entre las dos representaciones y tiene que aplicarse en todos los
// puntos de envío. Si alguno enviase la lista cruda, el backend no reconocería nada y los filtros
// dejarían de aplicarse EN SILENCIO — sin error, y arrastrando también al ranking, que escribe
// scores en Supabase.
// Se recorre el CATÁLOGO y no la lista para que el orden de claves sea determinista y coincida con
// el que producía mergeFiltros antes: es lo que permite comparar el JSON byte a byte.
// Los filtros de ámbito ACTIVO se omiten: el contrato plano no puede representarlos, y el backend
// no sabría evaluarlos. Hoy ese ámbito está vacío; el commit del MACD amplía backend y contrato.
export function aplanarFiltros(lista) {
  const out = {}
  for (const tipo of Object.keys(FILTROS_CATALOGO)) {
    const f = (lista || []).find(x => x.tipo === tipo && x.ambito === 'mercado')
    if (!f) continue
    out[tipo] = { activo: !!f.activo, ...{ ...FILTROS_CATALOGO[tipo].params, ...f.params } }
  }
  return out
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
