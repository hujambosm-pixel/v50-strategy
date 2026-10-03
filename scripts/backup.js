// scripts/backup.js
//
// COPIA DE SEGURIDAD COMPLETA DE LA BASE DE DATOS
//
//   npm run backup
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTE SCRIPT SUSTITUYE A LOS DOS ANTERIORES
// ─────────────────────────────────────────────────────────────────────────────
// backup-data.js y backup-strategies.js leían por PostgREST con la clave publicable. Desde que el RLS
// está activo en las 14 tablas, esa clave no ve NADA: la respuesta es `200 OK`, `Content-Range: */0`
// y una lista vacía. Y como el recuento de PostgREST pasa por la misma política que las filas, la
// comprobación «filas descargadas == total declarado» daba 0 == 0 y la copia se declaraba COMPLETA.
// Una copia vacía que dice «ok» es peor que no tener copia: la primera vez que se note será el día
// que haga falta restaurar.
//
// Este script lee por la Management API, que conecta como `postgres` —con rolbypassrls— y por tanto ve
// las filas de verdad. Y no se cree el recuento: lo pide en la MISMA consulta que las filas, así que
// los dos salen de la misma instantánea y compararlos significa algo.
//
// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA, Y COMPROBADO
// ─────────────────────────────────────────────────────────────────────────────
// Cada consulta va envuelta en `BEGIN READ ONLY; … ; ROLLBACK;`. Antes de copiar nada, el script
// intenta un `CREATE TEMP TABLE` dentro de esa envoltura y exige que PostgreSQL lo RECHACE. Si no lo
// rechaza, la envoltura no está funcionando y el script aborta sin tocar nada: no se hace una copia
// con un canal que podría escribir.
//
// ─────────────────────────────────────────────────────────────────────────────
// EL TOKEN NO SE ESCRIBE EN DISCO, NUNCA
// ─────────────────────────────────────────────────────────────────────────────
// Sale del Administrador de credenciales de Windows (donde lo deja `supabase login`), leído con
// CredRead a través de un PowerShell hijo, y vive solo en memoria de este proceso. No se imprime, no
// se guarda y no aparece en el resumen. Si prefieres pasarlo tú, SUPABASE_ACCESS_TOKEN tiene
// preferencia.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠  EL VOLCADO ES MATERIAL SENSIBLE
// ─────────────────────────────────────────────────────────────────────────────
// `user_settings` guarda claves de integración EN CLARO, incluida la de Groq, que es de pago y va a
// tu cuenta. `trades_log` es tu cartera real. `strategies` es la lógica entera de la aplicación.
// backups/ está en .gitignore y este repositorio es PÚBLICO: si estos ficheros salen de tu disco,
// todo eso sale con ellos. Si tienes que moverlos, cífralos antes.
//
// ─────────────────────────────────────────────────────────────────────────────
// QUÉ GUARDA
// ─────────────────────────────────────────────────────────────────────────────
//   backups/datos_completos_<fecha-hora>/
//     <tabla>.json              una por cada tabla del esquema public, descubiertas en el momento:
//                               una tabla nueva entra sola, sin tocar este fichero
//     estrategias/<nombre>.json una por estrategia, que es la única forma de restaurar UNA sin pisar
//                               las demás. Era la razón de existir de backup-strategies.js y se
//                               conserva aquí
//     _definicion_tablas.json   columnas, tipos, nullable, defaults, claves y índices
//     _politicas_rls.json       las políticas de cada tabla, con su USING y su WITH CHECK
//     _resumen.json             tabla, filas, recuento real, estado y tamaño
//
// RESTAURAR sigue siendo a mano, y es deliberado: importar es escribir, y un script que escribe en
// estas tablas es justo lo que no conviene tener a mano. Los JSON llevan las filas tal cual salieron.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const NL = String.fromCharCode(10)
const ROJO = '\x1b[31m', VERDE = '\x1b[32m', AMBAR = '\x1b[33m', GRIS = '\x1b[90m', FIN = '\x1b[0m'
const err = (...a) => console.error(ROJO + a.join(' ') + FIN)

// ── Token ────────────────────────────────────────────────────────────────────
// Se lee con CredRead, la misma API que usa la CLI de Supabase para guardarlo. El script de
// PowerShell va por -Command y no por un fichero: así no hay nada en disco ni siquiera temporal.
function leeToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim()
  if (process.platform !== 'win32') return null
  const ps = [
    '$ErrorActionPreference = "Stop"',
    '$sig = @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class CredLector {',
    '  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]',
    '  public struct CREDENTIAL {',
    '    public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment;',
    '    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;',
    '    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;',
    '    public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;',
    '  }',
    '  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]',
    '  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);',
    '  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);',
    '  public static string Get(string target) {',
    '    IntPtr p; if (!CredRead(target, 1, 0, out p)) { return null; }',
    '    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));',
    '    byte[] b = new byte[c.CredentialBlobSize];',
    '    Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);',
    '    CredFree(p); return System.Text.Encoding.UTF8.GetString(b);',
    '  }',
    '}',
    '"@',
    'Add-Type -TypeDefinition $sig | Out-Null',
    '$t = [CredLector]::Get("Supabase CLI:supabase")',
    'if (-not $t) { exit 2 }',
    'Write-Output $t.Trim()',
  ].join(NL)
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 })
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) return null
  return r.stdout.trim()
}

// ── Referencia del proyecto ──────────────────────────────────────────────────
function leeRef() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || (() => {
    try {
      const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
      for (const l of env.split(/\r?\n/)) {
        const m = l.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/)
        if (m) return m[1].trim()
      }
    } catch (_) {}
    return null
  })()
  if (!url) return null
  const m = String(url).match(/https?:\/\/([^.]+)\./)
  return m ? m[1] : null
}

const TOKEN = leeToken()
if (!TOKEN) {
  err(NL + '❌ No hay sesión con Supabase y sin ella no se puede hacer la copia.')
  console.error('')
  console.error('   Ejecuta esto y vuelve a intentarlo:')
  console.error('')
  console.error('       npx.cmd supabase login')
  console.error('')
  console.error('   Se abrirá el navegador; al volver, el token queda en el Administrador de')
  console.error('   credenciales de Windows y este script lo lee de ahí. También puedes pasarlo a mano')
  console.error('   con la variable SUPABASE_ACCESS_TOKEN si prefieres no usar la sesión de la CLI.' + NL)
  process.exit(1)
}
const REF = leeRef()
if (!REF) {
  err(NL + '❌ No sé a qué proyecto de Supabase conectarme.')
  console.error('   Define SUPABASE_URL o deja NEXT_PUBLIC_SUPABASE_URL en .env.local.' + NL)
  process.exit(1)
}

// ── Consulta en transacción de SOLO LECTURA ──────────────────────────────────
async function sql(consulta) {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'BEGIN READ ONLY;' + NL + consulta + NL + 'ROLLBACK;' }),
  })
  const txt = await res.text()
  let datos
  try { datos = JSON.parse(txt) } catch (_) { datos = txt }
  return { ok: res.ok, status: res.status, datos }
}
// `json_agg` devuelve una sola fila con el array entero. Los consumidores de aquí piden siempre una
// columna llamada `d`.
const lista = async (consulta) => {
  const r = await sql(consulta)
  if (!r.ok) throw new Error('consulta rechazada (HTTP ' + r.status + '): ' +
    (r.datos && r.datos.message ? r.datos.message : JSON.stringify(r.datos).slice(0, 200)))
  return r.datos[0].d
}

const sello = (() => {
  const d = new Date(), p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
})()
const DESTINO = path.join(__dirname, '..', 'backups', 'datos_completos_' + sello)
const kb = b => b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(2) + ' MB'
const slug = s => String(s).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'sin_nombre'

async function main() {
  const exportadoEn = new Date().toISOString()
  console.log('')
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  COPIA DE SEGURIDAD COMPLETA — proyecto ' + REF)
  console.log('══════════════════════════════════════════════════════════════════════')

  // 1. La envoltura de solo lectura TIENE que rechazar una escritura. Si no, no se copia nada.
  const prueba = await sql('CREATE TEMP TABLE _comprobacion_solo_lectura(x int);')
  if (prueba.ok) {
    err(NL + '❌ La transacción de solo lectura NO está bloqueando las escrituras.')
    console.error('   Un CREATE TEMP TABLE ha pasado cuando debía fallar. No se hace la copia:')
    console.error('   un canal que puede escribir no es un canal de copia.' + NL)
    process.exit(1)
  }
  console.log(GRIS + '  · transacción de solo lectura: verificada (la escritura de prueba fue rechazada)' + FIN)

  // 2. Todas las tablas del esquema public, descubiertas ahora. Nada de lista fija: una tabla nueva
  //    —las del optimizador, por ejemplo— entra en la copia sin que nadie toque este fichero.
  const tablas = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
    (SELECT c.relname AS tabla, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname) x;`)
  console.log(GRIS + '  · tablas descubiertas en el esquema public: ' + tablas.length + FIN)
  if (!tablas.length) {
    err(NL + '❌ No se ha encontrado ninguna tabla en el esquema public. Algo va mal; no se copia nada.' + NL)
    process.exit(1)
  }

  fs.mkdirSync(DESTINO, { recursive: true })

  // 3. Tabla por tabla. El recuento y las filas salen de la MISMA consulta, es decir de la misma
  //    instantánea: si no coinciden, es un fallo de verdad y no una carrera entre dos consultas.
  const resumen = []
  let bytes = 0
  for (const t of tablas) {
    const nombre = t.tabla
    try {
      const r = await sql(`SELECT (SELECT count(*)::bigint FROM public."${nombre}") AS total,
        coalesce(json_agg(x),'[]'::json) AS filas FROM (SELECT * FROM public."${nombre}") x;`)
      if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' +
        (r.datos && r.datos.message ? r.datos.message : JSON.stringify(r.datos).slice(0, 160)))
      const fila = r.datos[0]
      const total = Number(fila.total)
      const filas = Array.isArray(fila.filas) ? fila.filas : null
      if (!filas) throw new Error('la respuesta no trae una lista de filas')
      const cuadra = filas.length === total
      const json = JSON.stringify({
        _copia: { tabla: nombre, exportadoEn, filas: filas.length, recuentoReal: total, cuadra, rls: t.rls },
        filas,
      }, null, 2)
      fs.writeFileSync(path.join(DESTINO, nombre + '.json'), json, 'utf8')
      const b = Buffer.byteLength(json, 'utf8'); bytes += b
      resumen.push({ tabla: nombre, filas: filas.length, recuentoReal: total, rls: t.rls, bytes, estado: cuadra ? 'ok' : 'descuadre' })
      if (!cuadra) err(`  ✗ ${nombre}: guardadas ${filas.length} filas y la tabla tiene ${total}`)
    } catch (e) {
      resumen.push({ tabla: nombre, filas: null, recuentoReal: null, rls: t.rls, bytes: 0, estado: 'error', motivo: e.message })
      err(`  ✗ ${nombre}: ${e.message}`)
    }
  }

  // 4. Una estrategia por fichero: es la única forma de restaurar UNA sin pisar las demás, y era la
  //    razón de existir del script de estrategias que este sustituye.
  let nEstrategias = 0
  if (tablas.some(t => t.tabla === 'strategies') && resumen.find(r => r.tabla === 'strategies')?.estado === 'ok') {
    const dir = path.join(DESTINO, 'estrategias')
    fs.mkdirSync(dir, { recursive: true })
    const guardadas = JSON.parse(fs.readFileSync(path.join(DESTINO, 'strategies.json'), 'utf8')).filas
    const usados = new Map()
    for (const s of guardadas) {
      let base = slug(s.name)
      const n = (usados.get(base) || 0) + 1; usados.set(base, n)
      if (n > 1) base += '_' + n                       // dos estrategias con el mismo nombre no se pisan
      const json = JSON.stringify({ _copia: { exportadoEn, id: s.id, name: s.name, active: s.active, enabled: s.enabled }, estrategia: s }, null, 2)
      fs.writeFileSync(path.join(dir, base + '.json'), json, 'utf8')
      bytes += Buffer.byteLength(json, 'utf8'); nEstrategias++
    }
  }

  // 5. Definición de las tablas y políticas RLS: sin esto, los JSON de filas no bastan para
  //    reconstruir nada.
  const extras = []
  try {
    const columnas = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
      (SELECT table_name, ordinal_position, column_name, data_type, udt_name,
              is_nullable, column_default, character_maximum_length, numeric_precision
         FROM information_schema.columns WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position) x;`)
    const restricciones = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
      (SELECT conrelid::regclass::text AS tabla, conname AS nombre, contype AS tipo,
              pg_get_constraintdef(oid) AS definicion
         FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
        ORDER BY conrelid::regclass::text, conname) x;`)
    const indices = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
      (SELECT tablename AS tabla, indexname AS nombre, indexdef AS definicion
         FROM pg_indexes WHERE schemaname = 'public'
        ORDER BY tablename, indexname) x;`)
    const json = JSON.stringify({ _copia: { exportadoEn, proyecto: REF }, columnas, restricciones, indices }, null, 2)
    fs.writeFileSync(path.join(DESTINO, '_definicion_tablas.json'), json, 'utf8')
    bytes += Buffer.byteLength(json, 'utf8')
    extras.push({ que: 'definición de tablas', detalle: `${columnas.length} columnas, ${restricciones.length} restricciones, ${indices.length} índices`, estado: 'ok' })
  } catch (e) {
    extras.push({ que: 'definición de tablas', detalle: e.message, estado: 'error' })
    err('  ✗ definición de tablas: ' + e.message)
  }
  try {
    const politicas = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
      (SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'
        ORDER BY tablename, policyname) x;`)
    const rls = await lista(`SELECT coalesce(json_agg(x),'[]'::json) AS d FROM
      (SELECT c.relname AS tabla, c.relrowsecurity AS rls_activado, c.relforcerowsecurity AS rls_forzado
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname) x;`)
    const json = JSON.stringify({ _copia: { exportadoEn, proyecto: REF }, rlsPorTabla: rls, politicas }, null, 2)
    fs.writeFileSync(path.join(DESTINO, '_politicas_rls.json'), json, 'utf8')
    bytes += Buffer.byteLength(json, 'utf8')
    extras.push({ que: 'políticas RLS', detalle: `${politicas.length} políticas en ${rls.filter(r => r.rls_activado).length} tablas con RLS`, estado: 'ok' })
  } catch (e) {
    extras.push({ que: 'políticas RLS', detalle: e.message, estado: 'error' })
    err('  ✗ políticas RLS: ' + e.message)
  }

  // 6. Resumen
  const jsonResumen = JSON.stringify({ _copia: { exportadoEn, proyecto: REF, destino: DESTINO }, tablas: resumen, extras, estrategias: nEstrategias }, null, 2)
  fs.writeFileSync(path.join(DESTINO, '_resumen.json'), jsonResumen, 'utf8')
  bytes += Buffer.byteLength(jsonResumen, 'utf8')

  console.log('')
  console.log('  ' + 'TABLA'.padEnd(26) + 'FILAS'.padStart(8) + 'RECUENTO'.padStart(10) + '  RLS  ' + 'TAMAÑO'.padStart(10) + '  ESTADO')
  console.log('  ' + '─'.repeat(66))
  let prev = 0
  for (const r of resumen) {
    const tam = r.bytes - prev; prev = r.bytes
    const estado = r.estado === 'ok' ? VERDE + '✓' + FIN
      : r.estado === 'descuadre' ? ROJO + '✗ DESCUADRE' + FIN
      : ROJO + '✗ ' + (r.motivo || 'error') + FIN
    console.log('  ' + r.tabla.padEnd(26) + String(r.filas ?? '-').padStart(8) + String(r.recuentoReal ?? '-').padStart(10) +
      '   ' + (r.rls ? ' sí ' : ' NO ') + ' ' + (r.filas == null ? '-' : kb(tam)).padStart(10) + '  ' + estado)
  }
  console.log('  ' + '─'.repeat(66))
  for (const e of extras) {
    console.log('  ' + e.que.padEnd(26) + e.detalle.slice(0, 44).padEnd(46) +
      (e.estado === 'ok' ? VERDE + '✓' + FIN : ROJO + '✗' + FIN))
  }
  if (nEstrategias) console.log('  ' + 'estrategias, una por fichero'.padEnd(26) + String(nEstrategias).padStart(8) + ' ficheros')

  const malas = resumen.filter(r => r.estado !== 'ok')
  const extrasMal = extras.filter(e => e.estado !== 'ok')
  const filasTotal = resumen.reduce((s, r) => s + (r.filas || 0), 0)
  console.log('')
  console.log('  ' + resumen.length + ' tablas · ' + filasTotal + ' filas · ' + kb(bytes))
  console.log('  Copia en: ' + DESTINO)
  console.log('')
  console.log(AMBAR + '  ⚠ user_settings lleva claves de integración EN CLARO (Groq incluida), trades_log es tu' + FIN)
  console.log(AMBAR + '    cartera real y strategies es la lógica de la aplicación. backups/ está en .gitignore y' + FIN)
  console.log(AMBAR + '    este repositorio es PÚBLICO: no saques estos ficheros de tu disco sin cifrarlos.' + FIN)

  if (malas.length || extrasMal.length) {
    console.log('')
    err('══════════════════════════════════════════════════════════════════════')
    err('  LA COPIA NO ESTÁ COMPLETA. NO SIRVE PARA RESTAURAR.')
    for (const r of malas) err('   · ' + r.tabla + ': ' + (r.estado === 'descuadre'
      ? `guardadas ${r.filas} filas y la tabla tiene ${r.recuentoReal}` : (r.motivo || 'error')))
    for (const e of extrasMal) err('   · ' + e.que + ': ' + e.detalle)
    err('  Arregla lo de arriba y vuelve a lanzar `npm run backup`.')
    err('══════════════════════════════════════════════════════════════════════')
    console.log('')
    process.exit(1)
  }
  console.log('')
  console.log(VERDE + '  ✓ Copia completa: las ' + resumen.length + ' tablas cuadran con su recuento real.' + FIN)
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('')
}

main().catch(e => {
  err(NL + '❌ La copia ha fallado: ' + e.message)
  err('   No se ha guardado una copia utilizable. Vuelve a lanzar `npm run backup`.' + NL)
  process.exit(1)
})
