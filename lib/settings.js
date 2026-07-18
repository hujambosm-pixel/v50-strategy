import { getSupaUrl, getSupaH } from './supabase'

export const SETTINGS_KEY = 'v50_settings'

// Valores por defecto del bloque ranking
export const RANKING_DEFAULTS = {
  autoRefreshScoreMetSenHours: 24,  // 0 = desactivado
  rankingNormPercentile: 95,        // percentil cap para normalización dinámica
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')
    // Migración: rankingRsWindow ya no es configurable (ventana RS fija por timeframe: 63 diario / 13
    // semanal). Se elimina al cargar para que ningún lector la use y el próximo guardado la persista
    // sin ella (limpieza natural en Supabase). Defensivo: solo si ranking existe y tiene la clave.
    if (s && s.ranking && 'rankingRsWindow' in s.ranking) delete s.ranking.rankingRsWindow
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
  try {
    // user_id filtrado automáticamente por RLS (auth.uid() = user_id)
    const res = await fetch(`${getSupaUrl()}/rest/v1/user_settings?select=settings&order=updated_at.desc&limit=1`, {headers:getSupaH()})
    if(!res.ok) return null
    const data = await res.json()
    if(data?.[0]?.settings && Object.keys(data[0].settings).length > 0) return data[0].settings
    return null
  } catch(_){ return null }
}
