// ═══════════════════════════════════════════════════════════════════════════════
// MULTICARTERA — persistencia de los ajustes del modo de asignación
// ═══════════════════════════════════════════════════════════════════════════════
// Mismo mecanismo que los filtros de mercado (lib/filtros.js), por los mismos motivos:
//  · Clave PROPIA, fuera de v50_settings. SettingsModal toma una instantánea de settings al montarse
//    y su Guardar escribe esa instantánea entera, así que un dato que se escribe a cada clic se
//    perdería; y saveSettings(remote) reemplaza el objeto local completo al arrancar.
//  · Envoltorio {v, data} con marca de versión DESDE EL PRIMER GUARDADO: hoy cuesta un campo, y
//    añadirla sobre datos ya guardados sin ella es imposible.
//  · Se sanea sobre los defaults ANTES de tocar el estado. Si el estado naciera incompleto, lo que se
//    pinta y lo que viaja al backend podrían divergir.
//  · Descarte sin migrar: versión distinta, JSON roto o `data` que no sea objeto → defaults.
//
// Cada campo se valida SOLO contra su propio conjunto de valores admitidos, y uno inválido cae a su
// default sin invalidar el resto. No hay reglas cruzadas a propósito: los defaults de siempre ya
// combinan criterio 'alfabetico' con uso 'filtro' —que la interfaz deshabilita para Alfabético—, y
// una regla cruzada haría que una instalación nueva arrancara distinta de como arranca hoy.

export const ASIG_MC_LS_KEY = 'v50_mc_asignacion'
export const ASIG_MC_LS_VERSION = 1

// Valores admitidos: los que ofrece la interfaz del panel de multicartera.
const MODOS       = ['slots', 'compartido', 'concentrado', 'positionsizing']
const PRIORIDADES = ['score_metricas', 'alfabetico', 'momentum', 'fuerza_relativa', 'max52']
const USOS        = ['desempate', 'filtro']
const INTERVALOS  = ['diario', 'semanal']

// Defaults: exactamente los useState de siempre en pages/index.js.
export const ASIG_MC_DEFAULT = Object.freeze({
  modo:          'concentrado',     // mcMode — radio, con 2+ estrategias seleccionadas
  modos:         ['concentrado'],   // selectedModos — casillas, con 0-1 estrategias
  maxPosiciones: 4,                 // mcMaxPosiciones — 1..20
  prioridad:     'alfabetico',      // mcPrioridad — criterio de entrada
  criterioUso:   'filtro',          // mcCriterioUso
  momentumN:     20,                // mcMomentumN — "N días lookback" (Momentum), 5..120
  rsWindow:      63,                // mcRsWindow — "N velas lookback" (Fuerza relativa), 2..500
  intervalo:     'diario',          // mcIntervalo
})

const enLista = (lista, v, def) => lista.includes(v) ? v : def
// Mismo rango que acotan los inputs. Se exige número de verdad: JSON devuelve números como números,
// así que un string aquí solo puede venir de algo que no escribió esta app.
const enRango = (v, min, max, def) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def
// Casillas: se quedan las válidas, sin duplicados y en su orden. Vacío no es un estado posible —la
// interfaz impide desmarcar la última—, así que cae al default.
const modosValidos = (v) => {
  if (!Array.isArray(v)) return [...ASIG_MC_DEFAULT.modos]
  const out = []
  for (const m of v) if (MODOS.includes(m) && !out.includes(m)) out.push(m)
  return out.length ? out : [...ASIG_MC_DEFAULT.modos]
}

// Devuelve SIEMPRE un objeto nuevo y completo, con los ocho campos válidos.
export function mergeAsignacionMc(raw) {
  const d = ASIG_MC_DEFAULT
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    modo:          enLista(MODOS, r.modo, d.modo),
    modos:         modosValidos(r.modos),
    maxPosiciones: enRango(r.maxPosiciones, 1, 20, d.maxPosiciones),
    prioridad:     enLista(PRIORIDADES, r.prioridad, d.prioridad),
    criterioUso:   enLista(USOS, r.criterioUso, d.criterioUso),
    momentumN:     enRango(r.momentumN, 5, 120, d.momentumN),
    rsWindow:      enRango(r.rsWindow, 2, 500, d.rsWindow),
    intervalo:     enLista(INTERVALOS, r.intervalo, d.intervalo),
  }
}

// Una sola escritura con los ocho campos. Un fallo de localStorage (modo privado, cuota, SSR) no
// debe romper nada: se ignora.
export function guardarAsignacionMc(estado) {
  try {
    localStorage.setItem(ASIG_MC_LS_KEY, JSON.stringify({ v: ASIG_MC_LS_VERSION, data: mergeAsignacionMc(estado) }))
  } catch (_) {}
}

// Lectura síncrona en el montaje. En SSR no existe localStorage: el acceso lanza, lo recoge el catch
// y se arranca con defaults (el panel no está en el HTML inicial, así que no hay desajuste).
export function loadAsignacionMc() {
  try {
    const raw = localStorage.getItem(ASIG_MC_LS_KEY)
    if (!raw) return mergeAsignacionMc(null)
    const parsed = JSON.parse(raw)
    if (parsed?.v !== ASIG_MC_LS_VERSION) return mergeAsignacionMc(null)
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) return mergeAsignacionMc(null)
    return mergeAsignacionMc(parsed.data)
  } catch (_) { return mergeAsignacionMc(null) }
}
