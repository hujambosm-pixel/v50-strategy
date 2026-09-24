// scripts/backup-data.js
//
// COPIA DE SEGURIDAD LOCAL DE LOS DATOS
//
// SOLO LECTURA. Este script NUNCA escribe ni borra nada en Supabase: solo hace GET a /rest/v1/<tabla> y
// vuelca el resultado a disco. No hay un POST, PATCH ni DELETE en el fichero, ni bandera que los active.
// Se puede ejecutar tantas veces como se quiera sin consecuencias.
//
// ⚠⚠⚠  EL VOLCADO ES MATERIAL SENSIBLE  ⚠⚠⚠
//
// `user_settings` guarda las claves de integración EN CLARO, incluida una clave de API de Groq (`gsk_…`)
// que es de pago y va a tu cuenta, además de la URL y la clave de Supabase. Y `trades_log` es tu cartera
// real: qué tienes, cuánto, a qué precio, con qué bróker y con qué comisiones.
//
// NO SE VERSIONA, NO SE COMPARTE, NO SE SUBE A NINGÚN SITIO. `backups/` está en .gitignore y este
// repositorio es PÚBLICO: si estos ficheros salen de tu disco, la clave de Groq y tu cartera salen con
// ellos. Si alguna vez necesitas mover la copia, cífrala antes.
//
// USO:
//   node scripts/backup-data.js
//
// VARIABLES DE ENTORNO REQUERIDAS:
//   SUPABASE_URL       o NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY  o NEXT_PUBLIC_SUPABASE_ANON_KEY
// Sin ellas el script aborta sin hacer nada.
//
// QUÉ VUELCA: las 12 tablas del proyecto SALVO `strategies`, que tiene su propio script
// (scripts/backup-strategies.js) porque necesita un fichero por estrategia para poder restaurarlas una a
// una. Se piden todas, incluidas las que hoy están vacías: una tabla vacía hoy puede no estarlo mañana, y
// que aparezca con 0 filas es información, no ruido. Si una tabla no existe o no responde, se anota el
// motivo en el índice y se sigue con las demás.
//
// RESTAURACIÓN: no hay script de importación, y es deliberado — importar es escribir. Cada JSON lleva las
// filas tal y como salieron de la tabla, así que se recuperan desde el SQL Editor de Supabase o desde la
// propia aplicación, según la tabla.

const fs   = require('fs')
const path = require('path')

const SUPA_URL = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('\n❌ Faltan credenciales. El script no hace nada sin ellas.')
  console.error('   Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  console.error('   Ejemplo:  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/backup-data.js\n')
  process.exit(1)
}

const DESTINO = path.join(__dirname, '..', 'backups', 'data')

// `strategies` NO está aquí a propósito: la cubre scripts/backup-strategies.js.
const TABLAS = [
  'trades_log',
  'watchlist',
  'watchlist_lists',
  'watchlist_list_members',
  'alarms',
  'conditions',
  'ranking_results',
  'user_settings',
  'fx_rates',
  'capital_contributions',
  'pending_orders',
  'risk_profiles',
]

const PAGINA = 1000   // PostgREST corta en 1.000 filas por respuesta salvo que se pida un rango

const cabeceras = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }

// Descarga una tabla entera, paginando.
//
// POR QUÉ HACE FALTA PAGINAR: PostgREST devuelve como mucho 1.000 filas por respuesta. `ranking_results`
// tiene más de 6.000, así que un GET a secas se traería 1.000 y el volcado parecería completo. Se pide
// por rangos con la cabecera `Range` y se para cuando una página viene incompleta.
//
// CÓMO SE COMPRUEBA QUE ESTÁN TODAS: con `Prefer: count=exact`, PostgREST responde
// `Content-Range: 0-999/6031`, donde lo de después de la barra es el total REAL de la tabla, no el de la
// página. Ese total se guarda de la primera página y al final se compara con las filas descargadas. Si no
// cuadran, la tabla se marca como incompleta en el índice y en la salida: más vale una copia que se
// declara sospechosa que una que miente.
async function descargaTabla(tabla) {
  const filas = []
  let totalDeclarado = null
  for (let desde = 0; ; desde += PAGINA) {
    const hasta = desde + PAGINA - 1
    const res = await fetch(`${SUPA_URL}/rest/v1/${tabla}?select=*`, {
      headers: { ...cabeceras, Range: `${desde}-${hasta}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
    })
    if (!res.ok && res.status !== 206) {
      let motivo = `HTTP ${res.status}`
      try { motivo += ' — ' + (JSON.parse(await res.text()).message || '') } catch (_) {}
      return { error: motivo.trim() }
    }
    // "0-999/6031" → el total real va detrás de la barra. "*/0" en una tabla vacía.
    const cr = res.headers.get('content-range') || ''
    const tras = cr.split('/')[1]
    if (totalDeclarado === null && tras && tras !== '*') totalDeclarado = Number(tras)
    const pagina = await res.json()
    if (!Array.isArray(pagina)) return { error: 'la respuesta no es una lista de filas' }
    filas.push(...pagina)
    if (pagina.length < PAGINA) break           // página incompleta: no hay más
    if (totalDeclarado !== null && filas.length >= totalDeclarado) break
  }
  const completa = totalDeclarado === null || filas.length === totalDeclarado
  return { filas, totalDeclarado, completa }
}

async function main() {
  const exportadoEn = new Date().toISOString()
  fs.mkdirSync(DESTINO, { recursive: true })

  const indice = []
  let bytesTotal = 0

  for (const tabla of TABLAS) {
    let r
    try { r = await descargaTabla(tabla) } catch (e) { r = { error: e.message } }

    if (r.error) {
      // Una tabla que no existe o que no contesta no tumba la copia de las demás.
      indice.push({ tabla, estado: 'error', motivo: r.error, filas: null, exportadoEn })
      console.log(`  ⚠  ${tabla.padEnd(24)} ${r.error}`)
      continue
    }

    const fichero = `${tabla}.json`
    const json = JSON.stringify(
      { _backup: { tabla, exportadoEn, filas: r.filas.length, totalEnLaTabla: r.totalDeclarado, completa: r.completa }, filas: r.filas },
      null, 2,
    )
    fs.writeFileSync(path.join(DESTINO, fichero), json, 'utf8')
    const bytes = Buffer.byteLength(json, 'utf8')
    bytesTotal += bytes

    indice.push({
      tabla, estado: r.completa ? 'ok' : 'incompleta',
      filas: r.filas.length, totalEnLaTabla: r.totalDeclarado, fichero, bytes, exportadoEn,
    })
  }

  const rutaIndice = path.join(DESTINO, '_index.json')
  const jsonIndice = JSON.stringify({ exportadoEn, tablas: indice }, null, 2)
  fs.writeFileSync(rutaIndice, jsonIndice, 'utf8')
  bytesTotal += Buffer.byteLength(jsonIndice, 'utf8')

  const kb = (b) => (b / 1024).toFixed(1) + ' KB'
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  COPIA DE SEGURIDAD DE LOS DATOS')
  console.log('══════════════════════════════════════════════════════════════')
  console.log('  ' + 'TABLA'.padEnd(24) + 'FILAS'.padStart(7) + '  ' + 'TOTAL'.padStart(7) + '  ' + 'TAMAÑO'.padStart(10) + '  ESTADO')
  for (const e of indice) {
    if (e.estado === 'error') {
      console.log('  ' + e.tabla.padEnd(24) + '      -' + '        -' + '           -' + '  ⚠ ' + e.motivo)
      continue
    }
    console.log('  ' + e.tabla.padEnd(24)
      + String(e.filas).padStart(7) + '  '
      + String(e.totalEnLaTabla ?? '?').padStart(7) + '  '
      + kb(e.bytes).padStart(10) + '  '
      + (e.estado === 'ok' ? '✓' : '⚠ INCOMPLETA'))
  }
  const ok = indice.filter(e => e.estado === 'ok')
  console.log('  ' + '─'.repeat(58))
  console.log(`  ${ok.length} de ${TABLAS.length} tablas · ${ok.reduce((s, e) => s + e.filas, 0)} filas · ${kb(bytesTotal)}`)
  console.log(`  Destino : ${DESTINO}`)
  console.log(`  Índice  : ${rutaIndice}`)
  console.log('\n  ⚠ user_settings lleva claves de integración EN CLARO (Groq incluida) y trades_log es')
  console.log('    tu cartera real. backups/ está en .gitignore: este volcado NO se versiona ni se comparte.')
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
