import { getSupaUrl, getSupaH } from './supabase'

export const SETTINGS_KEY = 'v50_settings'

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}') } catch(_){ return {} }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch(_) {}
}
export async function saveSettingsRemote(s) {
  saveSettings(s)
  try {
    await fetch(`${getSupaUrl()}/rest/v1/user_settings?id=eq.1`, {
      method:'PATCH',
      headers:{...getSupaH(),'Prefer':'return=minimal'},
      body:JSON.stringify({settings:s, updated_at:new Date().toISOString()})
    })
  } catch(_) {}
}
export async function loadSettingsRemote() {
  try {
    const res = await fetch(`${getSupaUrl()}/rest/v1/user_settings?id=eq.1&select=settings`, {headers:getSupaH()})
    if(!res.ok) return null
    const data = await res.json()
    if(data?.[0]?.settings && Object.keys(data[0].settings).length > 0) return data[0].settings
    return null
  } catch(_){ return null }
}
