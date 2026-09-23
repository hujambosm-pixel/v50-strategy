// scripts/db-cleanup.js
//
// ⚠⚠⚠  PELIGRO — ESTE SCRIPT BORRA ESTRATEGIAS  ⚠⚠⚠
//
// QUÉ HACE, exactamente:
//   1. Renombra DOS estrategias, las que coincidan con RENAME_MAP.
//   2. HARD-DELETE de TODAS LAS DEMÁS filas de la tabla `strategies`.
//      No es un borrado lógico: no marca active=false, manda DELETE. Solo si RLS lo bloquea cae al
//      soft-delete como último recurso.
//
// QUÉ SIGNIFICA ESO HOY: la tabla tiene 77 filas, 69 con active=true. Ninguna de las dos de RENAME_MAP
// está entre ellas con ese nombre exacto, así que ejecutarlo **borraría las 77**.
//
// FUE UNA MIGRACIÓN DE UN SOLO USO — la «FASE 1» de preparación de la base de datos, de cuando la tabla
// tenía un puñado de filas— Y YA SE EJECUTÓ. Se conserva por trazabilidad de aquella migración, no
// porque haya que volver a pasarlo. Si lo que quieres es limpiar estrategias hoy, esto NO es la
// herramienta: bórralas desde la aplicación, que hace borrado lógico y es reversible.
//
// FASE 1 — Preparación base de datos
//
// USO:
//   node scripts/db-cleanup.js           → solo muestra qué haría (dry-run)
//   node scripts/db-cleanup.js --execute → SIGUE SIN BORRAR: además hace falta la confirmación explícita
//   CONFIRMAR_BORRADO=si node scripts/db-cleanup.js --execute   → esto sí borra
//
// VARIABLES DE ENTORNO REQUERIDAS (antes estaban escritas a pelo en el fichero):
//   SUPABASE_URL       o NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY  o NEXT_PUBLIC_SUPABASE_ANON_KEY
// Sin ellas el script aborta sin tocar nada.
//
// CAMBIO 1 (DDL — ejecutar en Supabase SQL Editor, no aquí):
//   ALTER TABLE strategies ADD COLUMN IF NOT EXISTS code_js   text;
//   ALTER TABLE strategies ADD COLUMN IF NOT EXISTS code_pine text;
//
// CAMBIO 2 (este script):
//   - Renombrar "V50 EMA10/11" → "R-V50 EMA10/11"
//   - Renombrar "V50 EMA10/11 (SP500 over EMA)" → "R-V50 EMA10/11 (SP500 over EMA)"
//   - Hard-delete todas las demás filas

const SUPA_URL = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('\n❌ Faltan credenciales. Este script no toca nada sin ellas.')
  console.error('   Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  console.error('   Ejemplo:  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/db-cleanup.js\n')
  process.exit(1)
}

const EXECUTE = process.argv.includes('--execute')
// Salvaguarda: --execute por sí solo YA NO BORRA. Un script que arrasa una tabla entera no puede estar a
// un flag de distancia en el historial del terminal, y menos ahora que la tabla tiene 77 filas y no las
// cuatro de la migración original.
const CONFIRMADO = process.env.CONFIRMAR_BORRADO === 'si'

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

  if (!EXECUTE || !CONFIRMADO) {
    console.log('\n══════════════════════════════════════════')
    console.log('  DRY-RUN — no se ha modificado nada.')
    if (EXECUTE && !CONFIRMADO) {
      console.log('  Se pidió --execute pero FALTA LA CONFIRMACIÓN.')
      console.log(`  Esto habría BORRADO ${toDelete.length} estrategias de forma irreversible.`)
      console.log('  Si de verdad es lo que quieres:')
      console.log('    CONFIRMAR_BORRADO=si node scripts/db-cleanup.js --execute')
    } else {
      console.log('  Para ejecutar: CONFIRMAR_BORRADO=si node scripts/db-cleanup.js --execute')
    }
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
