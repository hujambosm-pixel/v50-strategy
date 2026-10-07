// scripts/guardian/lecturaBd.js — lectura de la base de datos para el guardián, en SOLO LECTURA.
//
// El token y el proyecto se obtienen EXACTAMENTE como en scripts/backup.js (las dos funciones de abajo están
// copiadas de allí tal cual, salvo la ruta a .env.local, que desde esta carpeta está dos niveles arriba):
// del Administrador de credenciales de Windows, donde lo deja `supabase login`, o de SUPABASE_ACCESS_TOKEN.
// El token vive solo en memoria; no se imprime ni se guarda.
//
// Toda consulta va envuelta en BEGIN READ ONLY … ROLLBACK, y antes de la primera se exige que PostgreSQL
// RECHACE una escritura de prueba dentro de esa envoltura, igual que hace la copia de seguridad.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const NL = String.fromCharCode(10)

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
      const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8')
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


let comprobado = false
async function consultaSoloLectura(consulta) {
  const TOKEN = leeToken(), REF = leeRef()
  if (!TOKEN) throw new Error('No hay sesión con Supabase: ejecuta «npx.cmd supabase login» o define SUPABASE_ACCESS_TOKEN.')
  if (!REF) throw new Error('No sé a qué proyecto conectarme: define SUPABASE_URL o deja NEXT_PUBLIC_SUPABASE_URL en .env.local.')
  const envia = async (q) => {
    const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'BEGIN READ ONLY;' + NL + q + NL + 'ROLLBACK;' }),
    })
    const txt = await res.text()
    let datos; try { datos = JSON.parse(txt) } catch (_) { datos = txt }
    return { ok: res.ok, status: res.status, datos }
  }
  if (!comprobado) {
    const prueba = await envia('CREATE TEMP TABLE _comprobacion_solo_lectura(x int);')
    if (prueba.ok) throw new Error('La transacción de solo lectura NO bloquea las escrituras: no se lee nada por este canal.')
    comprobado = true
  }
  const r = await envia(consulta)
  if (!r.ok) throw new Error('consulta rechazada (HTTP ' + r.status + '): ' +
    (r.datos && r.datos.message ? r.datos.message : JSON.stringify(r.datos)).slice(0, 300))
  return r.datos
}

module.exports = { consultaSoloLectura }
