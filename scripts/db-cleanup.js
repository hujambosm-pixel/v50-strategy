// scripts/db-cleanup.js
// FASE 1 — Preparación base de datos
//
// USO:
//   node scripts/db-cleanup.js           → solo muestra qué haría (dry-run)
//   node scripts/db-cleanup.js --execute → ejecuta los cambios
//
// CAMBIO 1 (DDL — ejecutar en Supabase SQL Editor, no aquí):
//   ALTER TABLE strategies ADD COLUMN IF NOT EXISTS code_js   text;
//   ALTER TABLE strategies ADD COLUMN IF NOT EXISTS code_pine text;
//
// CAMBIO 2 (este script):
//   - Renombrar "V50 EMA10/11" → "R-V50 EMA10/11"
//   - Renombrar "V50 EMA10/11 (SP500 over EMA)" → "R-V50 EMA10/11 (SP500 over EMA)"
//   - Hard-delete todas las demás filas

const SUPA_URL = 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

const EXECUTE = process.argv.includes('--execute')

const RENAME_MAP = {
  'V50 EMA10/11':                    'R-V50 EMA10/11',
  'V50 EMA10/11 (SP500 over EMA)':   'R-V50 EMA10/11 (SP500 over EMA)',
}

const headers = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
}

async function supaFetch(path, options = {}) {
  const url = `${SUPA_URL}/rest/v1${path}`
  const res = await fetch(url, { headers, ...options })
  const text = await res.text()
  if (!res.ok) throw new Error(`[${res.status}] ${text}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  // ── Leer todas las estrategias (activas e inactivas) ──
  const all = await supaFetch('/strategies?select=id,name,active&order=created_at.asc')
  if (!all || all.length === 0) {
    console.log('No se encontraron estrategias en la tabla.')
    return
  }

  const toRename = all.filter(s => RENAME_MAP[s.name])
  const toDelete = all.filter(s => !RENAME_MAP[s.name])

  // ── Mostrar resumen ──
  console.log('\n══════════════════════════════════════════')
  console.log(`  ESTRATEGIAS EN TABLA: ${all.length}`)
  console.log('══════════════════════════════════════════')
  console.log('\n📋 TODAS LAS ESTRATEGIAS ENCONTRADAS:')
  all.forEach(s => {
    const action = RENAME_MAP[s.name]
      ? `  → RENOMBRAR → "${RENAME_MAP[s.name]}"`
      : `  → ELIMINAR`
    const active = s.active ? '' : ' [inactiva]'
    console.log(`  [${s.id}] "${s.name}"${active}${action}`)
  })

  console.log(`\n✏️  A RENOMBRAR (${toRename.length}):`)
  if (toRename.length === 0) {
    console.log('  ⚠️  Ninguna coincide con los nombres esperados.')
    console.log('  Nombres esperados:')
    Object.keys(RENAME_MAP).forEach(n => console.log(`    - "${n}"`))
  } else {
    toRename.forEach(s => console.log(`  "${s.name}" → "${RENAME_MAP[s.name]}"`))
  }

  console.log(`\n🗑️  A ELIMINAR (${toDelete.length}):`)
  toDelete.forEach(s => console.log(`  [${s.id}] "${s.name}"`))

  if (!EXECUTE) {
    console.log('\n══════════════════════════════════════════')
    console.log('  DRY-RUN — no se ha modificado nada.')
    console.log('  Para ejecutar: node scripts/db-cleanup.js --execute')
    console.log('══════════════════════════════════════════\n')
    return
  }

  // ── Ejecutar cambios ──
  console.log('\n══════════════════════════════════════════')
  console.log('  EJECUTANDO CAMBIOS...')
  console.log('══════════════════════════════════════════\n')

  // Renombrar
  for (const s of toRename) {
    const newName = RENAME_MAP[s.name]
    try {
      await supaFetch(`/strategies?id=eq.${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
      })
      console.log(`  ✅ Renombrado: "${s.name}" → "${newName}"`)
    } catch (e) {
      console.error(`  ❌ Error renombrando "${s.name}": ${e.message}`)
    }
  }

  // Hard-delete
  for (const s of toDelete) {
    try {
      await supaFetch(`/strategies?id=eq.${s.id}`, {
        method: 'DELETE',
        headers: { ...headers, 'Prefer': 'return=minimal' },
      })
      console.log(`  ✅ Eliminado:  [${s.id}] "${s.name}"`)
    } catch (e) {
      // Si RLS bloquea el hard-delete, hacer soft-delete como fallback
      try {
        await supaFetch(`/strategies?id=eq.${s.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        })
        console.log(`  ⚠️  Soft-delete (RLS): [${s.id}] "${s.name}"`)
      } catch (e2) {
        console.error(`  ❌ Error eliminando [${s.id}] "${s.name}": ${e2.message}`)
      }
    }
  }

  console.log('\n  ✅ Completado.\n')
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
