import { getSupaUrl, getSupaH, hayConfigSupabase } from './supabase'

export const SETTINGS_KEY = 'v50_settings'

// Valores por defecto del bloque ranking
export const RANKING_DEFAULTS = {
  // ── Condiciones con las que el ranking mide TODAS las estrategias ──────────────────────
  // El ranking compara estrategias entre sí, así que tiene que medirlas en las MISMAS
  // condiciones. Antes cada una se medía con su propia columna `years` y su propio
  // `capital_ini`: «23.0 EMA20 breakouts (open)» llevaba 20 años frente a los 5 de las otras
  // 43, y las cuatro filas con 1.000 € de capital habrían dado un CAGR calculado sobre otra
  // base. Comparar eso no significa nada. La temporalidad es la excepción y sigue siendo de
  // cada estrategia: una estrategia semanal ejecutada en diario es otra estrategia.
  rankingYears: 5,                  // periodo común, en años
  rankingCapital: 10000,            // capital inicial común, en euros
  rankingComisionesPropias: false,  // false = usa las de «Comisiones por defecto»
  minTrades: 3,                     // mínimo de operaciones para que una fila cuente
  autoRefreshScoreMetSenHours: 24,  // 0 = desactivado — recompone SOLO scores (sin backtest)
  metricsReminderDays: 15,          // 0 = desactivado — avisa si hay métricas más antiguas que N días
  metricsReminderBatch: 30,         // nº de activos (los más antiguos) que actualiza el aviso
  // ── Umbrales ABSOLUTOS de normalización del score (suelo = 0 pts, techo = 100 pts) ──
  // Sustituyen a la normalización por percentiles: un valor dado da siempre los mismos puntos,
  // independientemente de con qué otros activos se compare.
  rankingWinRateFloor:  25, rankingWinRateCeil:  65,
  rankingCAGRFloor:      0, rankingCAGRCeil:     40,
  rankingRobustezFloor: 30, rankingRobustezCeil: 85,
  // Max drawdown INVERTIDO: el suelo es el peor valor (0 pts) y el techo el mejor (100 pts)
  rankingMaxDDFloor:    50, rankingMaxDDCeil:    10,
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')
    // Migración: rankingRsWindow ya no es configurable (ventana RS fija por timeframe: 63 diario / 13
    // semanal). Se elimina al cargar para que ningún lector la use y el próximo guardado la persista
    // sin ella (limpieza natural en Supabase). Defensivo: solo si ranking existe y tiene la clave.
    if (s && s.ranking && 'rankingRsWindow' in s.ranking) delete s.ranking.rankingRsWindow
    // Migración: rankingNormPercentile ya no se usa (la normalización pasó de percentiles del
    // universo a umbrales absolutos configurables por métrica).
    if (s && s.ranking && 'rankingNormPercentile' in s.ranking) delete s.ranking.rankingNormPercentile
    return s
  } catch(_){ return {} }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch(_) {}
}

// user_settings filtrada por user_id (auth.uid() via RLS).
// PATCH con upsert: si no existe la fila la crea; si existe la actualiza.
export async function saveSettingsRemote(s) {
  saveSettings(s)
  try {
    await fetch(`${getSupaUrl()}/rest/v1/user_settings`, {
      method:'POST',
      headers:{...getSupaH(),'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({settings:s, updated_at:new Date().toISOString()})
    })
  } catch(_) {}
}
export async function loadSettingsRemote() {
  // Sin configuración no se intenta: la petición saldría contra el propio dominio, daría 404 y el
  // `if(!res.ok) return null` de abajo lo tragaría sin dejar rastro. Es el circulo vicioso que tenia
  // esto: los ajustes guardan la URL, y para leerlos hace falta la URL.
  if (!hayConfigSupabase()) {
    console.error('[settings] Sin configuración de Supabase: no se cargan los ajustes remotos. '
      + 'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno, '
      + 'o la URL y la clave en Ajustes → Integraciones.')
    return null
  }
  try {
    // user_id filtrado automáticamente por RLS (auth.uid() = user_id)
    const res = await fetch(`${getSupaUrl()}/rest/v1/user_settings?select=settings&order=updated_at.desc&limit=1`, {headers:getSupaH()})
    if(!res.ok) return null
    const data = await res.json()
    if(data?.[0]?.settings && Object.keys(data[0].settings).length > 0) return data[0].settings
    return null
  } catch(_){ return null }
}
