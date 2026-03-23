// Supabase config — read from Settings (localStorage)
export function getSupaUrl() { try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.supabaseUrl||'' } catch(_){ return '' } }
export function getSupaKey() { try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.supabaseKey||'' } catch(_){ return '' } }

// JWT from active Supabase Auth session — set by pages/index.js on auth state change
let _currentJwt = null
export function setCurrentJwt(jwt) { _currentJwt = jwt }
export function getCurrentJwt() { return _currentJwt }

// Headers for direct Supabase REST calls — uses session JWT when available, anon key as fallback
export function getSupaH() {
  const k = getSupaKey()
  return { apikey: k, Authorization: `Bearer ${_currentJwt || k}`, 'Content-Type': 'application/json' }
}
