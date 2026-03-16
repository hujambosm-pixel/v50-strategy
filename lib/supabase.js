// Supabase config — read from Settings (localStorage)
export function getSupaUrl() { try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.supabaseUrl||'' } catch(_){ return '' } }
export function getSupaKey() { try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.supabaseKey||'' } catch(_){ return '' } }
export function getSupaH() { const k=getSupaKey(); return {apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json'} }
