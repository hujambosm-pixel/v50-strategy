// Conditions — localStorage-first, Supabase optional
import { getCurrentJwt, fetchConSesion } from './supabase'

export const COND_LS_KEY = 'v50_conditions'
export function lsGetConds() { try { return JSON.parse(localStorage.getItem(COND_LS_KEY)||'[]') } catch(_) { return [] } }
export function lsSaveConds(arr) { try { localStorage.setItem(COND_LS_KEY, JSON.stringify(arr)) } catch(_) {} }

// Cabeceras de las cinco llamadas a /api/conditions. El JWT se añade AQUI y no en cada llamada: las
// cinco pasan por esta funcion, asi que es el unico punto que hay que tocar y ninguna puede quedarse
// fuera por olvido.
//
// x-supa-url y x-supa-key SE QUEDAN de momento. pages/api/conditions.js las acepta como respaldo cuando
// no hay variables de entorno, y quitarlas ahora romperia ese camino. Se iran cuando el servidor deje de
// admitirlas, que es otro commit y toca el servidor.
//
// Sin sesion no se manda la cabecera, igual que hace apiFetch en pages/index.js: hoy el servidor cae a
// la clave anonima y la llamada funciona igual.
function getSupaHeaders(jwt = getCurrentJwt()) {
  try {
    const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
    return {
      'x-supa-url': s?.integrations?.supabaseUrl||'',
      'x-supa-key': s?.integrations?.supabaseKey||'',
      ...(jwt ? { 'x-supa-jwt': jwt } : {})
    }
  } catch(_) {
    // Si localStorage falla, el JWT sigue mereciendo la pena: es lo unico que autentica.
    return jwt ? { 'x-supa-jwt': jwt } : {}
  }
}

// Las cinco llamadas de este fichero pasan por aquí, así que heredan el reintento por sesión caducada
// sin que haya que repetirlo cinco veces. `extra` son las cabeceras propias de cada una —Content-Type,
// x-groq-key—, que no dependen del token.
function condFetch(url, opts = {}, extra = {}) {
  return fetchConSesion(url, opts, (jwt) => ({ ...extra, ...getSupaHeaders(jwt) }))
}

export async function fetchConditions() {
  const localAll = lsGetConds()
  const localOnly = localAll.filter(c => c.id?.startsWith('local_'))
  try {
    const res = await condFetch('/api/conditions')
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
  console.log('[conditions] POST payload:', JSON.stringify(cond))
  try {
    const res = await condFetch('/api/conditions', {
      method:'POST',
      body:JSON.stringify(cond)
    }, {'Content-Type':'application/json','x-groq-key':groqKey})
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

export async function updateCondition(id, updates) {
  // Update localStorage
  lsSaveConds(lsGetConds().map(c => c.id === id ? { ...c, ...updates } : c))
  // Update remote (only for non-local IDs)
  if (!id?.startsWith('local_')) {
    console.log('[conditions] PATCH id=' + id + ' payload:', JSON.stringify(updates))
    try {
      await condFetch(`/api/conditions?id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }, { 'Content-Type': 'application/json' })
    } catch(_) {}
  }
}

export async function deleteCondition(id) {
  if (!id?.startsWith('local_')) {
    try {
      const res = await condFetch(`/api/conditions?id=${id}`, {method:'DELETE'})
      if (!res.ok) console.warn('Supabase delete failed')
    } catch(_) {}
  }
  lsSaveConds(lsGetConds().filter(c => c.id !== id))
}

export async function groqParseCondition(text) {
  const groqKey=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||''}catch(_){return ''}})()
  const res=await condFetch('/api/conditions?action=groq',{method:'POST',body:JSON.stringify({text})},{'Content-Type':'application/json','x-groq-key':groqKey})
  const json=await res.json()
  if(!res.ok||json.error) throw new Error(json.error||'Error Groq')
  return json
}
