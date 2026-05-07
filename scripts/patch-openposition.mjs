// scripts/patch-openposition.mjs
// Adds openPosition to all code_js strategies in Supabase

const SUPA_URL = 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

const headers = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

// Fetch all strategies with code_js
const r = await fetch(`${SUPA_URL}/rest/v1/strategies?select=id,name,code_js`, { headers })
const strategies = await r.json()

let updated = 0, skipped = 0

for (const s of strategies) {
  if (!s.code_js) { console.log(`SKIP  [no code_js] ${s.name}`); skipped++; continue }
  if (s.code_js.includes('openPosition')) { console.log(`SKIP  [already has openPosition] ${s.name}`); skipped++; continue }

  let code = s.code_js

  // Pattern A: return { trades, indicators: { emaR, emaL } }
  // Pattern B: return { trades, indicators: { emaR, emaL }, filterZones }
  // Pattern C: return { trades, indicators: { emaR: ema } }
  // All share the same state vars: enPos, pxEntrada, fechaEntrada, nivelStop, trailingStop

  const openPositionLine = `  const openPosition = enPos ? { entryDate: fechaEntrada, entryPrice: pxEntrada, stopPx: nivelStop ?? trailingStop ?? null } : null\n`

  // Replace each return pattern — insert openPosition declaration before return, add to return obj
  code = code
    // Pattern B: with filterZones
    .replace(
      /(\s+)return \{ trades, indicators: \{ emaR, emaL \}, filterZones \}\n\}/,
      `\n${openPositionLine}$1return { trades, indicators: { emaR, emaL }, filterZones, openPosition }\n}`
    )
    // Pattern A: without filterZones, emaR + emaL
    .replace(
      /(\s+)return \{ trades, indicators: \{ emaR, emaL \} \}\n\}/,
      `\n${openPositionLine}$1return { trades, indicators: { emaR, emaL }, openPosition }\n}`
    )
    // Pattern C: emaR: ema (single EMA strategy)
    .replace(
      /(\s+)return \{ trades, indicators: \{ emaR: ema \} \}\n\}/,
      `\n${openPositionLine}$1return { trades, indicators: { emaR: ema }, openPosition }\n}`
    )

  if (code === s.code_js) {
    console.log(`WARN  [no pattern matched] ${s.name}`)
    skipped++
    continue
  }

  const patch = await fetch(
    `${SUPA_URL}/rest/v1/strategies?id=eq.${s.id}`,
    { method: 'PATCH', headers, body: JSON.stringify({ code_js: code }) }
  )
  if (patch.ok) {
    console.log(`OK    [updated] ${s.name}`)
    updated++
  } else {
    const err = await patch.text()
    console.log(`ERROR [${patch.status}] ${s.name}: ${err}`)
  }
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped.`)
