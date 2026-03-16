// Conditions — localStorage-first, Supabase optional
export const COND_LS_KEY = 'v50_conditions'
export function lsGetConds() { try { return JSON.parse(localStorage.getItem(COND_LS_KEY)||'[]') } catch(_) { return [] } }
export function lsSaveConds(arr) { try { localStorage.setItem(COND_LS_KEY, JSON.stringify(arr)) } catch(_) {} }

function getSupaHeaders() {
  try {
    const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
    return {
      'x-supa-url': s?.integrations?.supabaseUrl||'',
      'x-supa-key': s?.integrations?.supabaseKey||''
    }
  } catch(_) { return {} }
}

export async function fetchConditions() {
  const localAll = lsGetConds()
  const localOnly = localAll.filter(c => c.id?.startsWith('local_'))
  try {
    const res = await fetch('/api/conditions', { headers: getSupaHeaders() })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && !data.error) {
        const merged = [...data, ...localOnly]
        lsSaveConds(merged)
        return merged
      }
    }
  } catch(_) {}
  return localAll
}

export async function saveCondition(cond) {
  const localId = 'local_' + Date.now()
  const localEntry = { ...cond, id: localId, created_at: new Date().toISOString(), active: true }
  lsSaveConds([...lsGetConds(), localEntry])

  const groqKey=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||''}catch(_){return ''}})()
  try {
    const res = await fetch('/api/conditions', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-groq-key':groqKey,...getSupaHeaders()},
      body:JSON.stringify(cond)
    })
    if (res.ok) {
      const saved = await res.json()
      if (saved?.id) {
        lsSaveConds(lsGetConds().filter(c => c.id !== localId))
        return saved
      }
    }
  } catch(_) {}
  return localEntry
}

export async function deleteCondition(id) {
  if (!id?.startsWith('local_')) {
    try {
      const res = await fetch(`/api/conditions?id=${id}`, {method:'DELETE', headers: getSupaHeaders()})
      if (!res.ok) console.warn('Supabase delete failed')
    } catch(_) {}
  }
  lsSaveConds(lsGetConds().filter(c => c.id !== id))
}

export async function groqParseCondition(text) {
  const groqKey=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||''}catch(_){return ''}})()
  const res=await fetch('/api/conditions?action=groq',{method:'POST',headers:{'Content-Type':'application/json','x-groq-key':groqKey,...getSupaHeaders()},body:JSON.stringify({text})})
  const json=await res.json()
  if(!res.ok||json.error) throw new Error(json.error||'Error Groq')
  return json
}
