// scripts/backup-strategies.js
//
// COPIA DE SEGURIDAD LOCAL DE LAS ESTRATEGIAS
//
// SOLO LECTURA. Este script NUNCA escribe ni borra nada en Supabase: hace un único GET a
// /rest/v1/strategies y vuelca el resultado a disco. No hay ningún PATCH, POST ni DELETE en el fichero,
// ni bandera que los active. Se puede ejecutar tantas veces como se quiera sin consecuencias.
//
// POR QUÉ EXISTE: el code_js de las estrategias vive SOLO en Supabase. No está en el repositorio, no hay
// copia en ninguna otra parte, y el repositorio es PÚBLICO, así que tampoco puede estar. Un borrado por
// error —o un DELETE lanzado contra la base de datos, que hoy cualquiera puede hacer— se lleva por
// delante la lógica entera de la aplicación sin forma de recuperarla.
//
// EL VOLCADO NO SE VERSIONA. backups/ está en .gitignore. No lo saques de ahí: cada JSON lleva el code_js
// completo de una estrategia.
//
// USO:
//   node scripts/backup-strategies.js
//
// VARIABLES DE ENTORNO REQUERIDAS:
//   SUPABASE_URL       o NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY  o NEXT_PUBLIC_SUPABASE_ANON_KEY
// Sin ellas el script aborta sin hacer nada.
//
// QUÉ EXPORTA: TODAS las filas, incluidas las de active=false —borradas de forma lógica desde la
// aplicación—. Una estrategia borrada por error es justo lo que se quiere poder recuperar, así que
// filtrarlas sería vaciar la caja fuerte de lo único que se guarda en ella. Cada fichero dice en
// `_backup.active` si estaba viva en el momento de la copia.
//
// ─────────────────────────────────────────────────────────────────────────────
// CÓMO RESTAURAR UNA ESTRATEGIA, A MANO
// ─────────────────────────────────────────────────────────────────────────────
// No hay script de importación, y es deliberado: importar es escribir, y un script que escribe en la
// tabla de estrategias es exactamente lo que no queremos tener a mano. Se restaura desde la aplicación:
//
//   1. Busca el JSON en backups/strategies/. El nombre lleva el de la estrategia; si dudas, mira
//      _index.json, que los lista todos con su id.
//   2. En la aplicación, crea una estrategia nueva (o abre la que quieras sobrescribir) y ponle el
//      `name` del JSON.
//   3. Copia el campo `code_js` del JSON y pégalo en el editor de código de la estrategia.
//   4. Copia el campo `params` y pégalo en el editor de parámetros. Es un JSON: pégalo tal cual, con
//      sus llaves.
//   5. Si la estrategia dibujaba algo especial, copia también `visuals` del mismo modo.
//   6. Guarda. El resto de campos —years, capital_ini, color, description— se rellenan a mano desde la
//      ficha, y están todos en el JSON por si quieres dejarla igual que estaba.
//
// Si lo que restauras es una estrategia con active=false, tras guardarla estará activa: el borrado
// lógico no se restaura, se crea de nuevo.
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs')
const path = require('path')

const SUPA_URL = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('\n❌ Faltan credenciales. El script no hace nada sin ellas.')
  console.error('   Define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  console.error('   Ejemplo:  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/backup-strategies.js\n')
  process.exit(1)
}

const DESTINO = path.join(__dirname, '..', 'backups', 'strategies')

// Nombre de fichero a partir del de la estrategia: minúsculas, sin acentos, espacios y cualquier otro
// signo convertidos en guiones. El id va al final porque dos estrategias pueden llamarse igual —o
// quedar igual tras limpiar los signos—, y ahí el nombre solo no distingue.
function nombreFichero(nombre, id) {
  const base = String(nombre || 'sin-nombre')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita los diacríticos que NFD ha separado
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sin-nombre'
  return `${base}__${id}.json`
}

async function main() {
  const exportadoEn = new Date().toISOString()

  const url = `${SUPA_URL}/rest/v1/strategies?select=*&order=created_at.asc`
  const res = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
  if (!res.ok) throw new Error(`[${res.status}] ${(await res.text()).slice(0, 200)}`)
  const filas = await res.json()
  if (!Array.isArray(filas) || !filas.length) {
    console.log('\n⚠  La consulta no devolvió ninguna estrategia. No se ha escrito nada.\n')
    return
  }

  fs.mkdirSync(DESTINO, { recursive: true })

  const indice = []
  let bytes = 0
  const usados = new Set()
  for (const fila of filas) {
    let fichero = nombreFichero(fila.name, fila.id)
    // Cinturón: si aun con el id colisionara, no se pisa un fichero ya escrito.
    let n = 2
    while (usados.has(fichero)) fichero = fichero.replace(/\.json$/, `-${n++}.json`)
    usados.add(fichero)

    // La fila entera, sin tocar ni un campo, más un bloque propio con lo que hace falta para saber qué
    // es este fichero sin abrir el índice.
    const contenido = {
      _backup: { exportadoEn, fichero, id: fila.id, name: fila.name, active: fila.active, enabled: fila.enabled },
      ...fila,
    }
    const json = JSON.stringify(contenido, null, 2)
    fs.writeFileSync(path.join(DESTINO, fichero), json, 'utf8')
    bytes += Buffer.byteLength(json, 'utf8')

    indice.push({ id: fila.id, name: fila.name, active: fila.active, enabled: fila.enabled, fichero, exportadoEn })
  }

  const rutaIndice = path.join(DESTINO, '_index.json')
  const jsonIndice = JSON.stringify({ exportadoEn, total: indice.length, estrategias: indice }, null, 2)
  fs.writeFileSync(rutaIndice, jsonIndice, 'utf8')
  bytes += Buffer.byteLength(jsonIndice, 'utf8')

  const activas  = filas.filter(f => f.active === true).length
  const borradas = filas.filter(f => f.active === false).length
  const otras    = filas.length - activas - borradas

  console.log('\n══════════════════════════════════════════')
  console.log('  COPIA DE SEGURIDAD DE ESTRATEGIAS')
  console.log('══════════════════════════════════════════')
  console.log(`  Exportadas        : ${filas.length}`)
  console.log(`    activas         : ${activas}`)
  console.log(`    borradas (lógico): ${borradas}`)
  if (otras) console.log(`    sin active       : ${otras}`)
  console.log(`  Tamaño            : ${(bytes / 1024).toFixed(1)} KB`)
  console.log(`  Destino           : ${DESTINO}`)
  console.log(`  Índice            : ${rutaIndice}`)
  console.log('\n  backups/ está en .gitignore: este volcado NO se versiona.')
  console.log('══════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
