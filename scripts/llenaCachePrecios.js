// scripts/llenaCachePrecios.js — llenado inicial (y relleno) de la caché de precios.
//
//   node scripts/llenaCachePrecios.js                       todos los activos de la watchlist
//   node scripts/llenaCachePrecios.js --lista "Degiro"      solo esa lista de la watchlist
//   node scripts/llenaCachePrecios.js --simbolo NVDA        solo ese símbolo (aunque esté al día)
//   opciones: --anios 20 (histórico a pedir) · --pausa 1000 (ms entre descargas) · --forzar (no saltar
//   los que ya están al día) · --dias-al-dia 4 (cuántos días de retraso cuentan como «al día»)
//   node scripts/llenaCachePrecios.js --universo NDX --desde 2005-01-01
//                                                           los símbolos de Yahoo de public.universo_miembros (ese índice)
//                                                           que AÚN NO están en la caché (nunca toca los que ya están),
//                                                           desde esa fecha (o desde su salida a bolsa); sin benchmarks
//
// DESCARGA ROBUSTA (descargaConReintentos, exportada y probada sin red):
//   · un error de red o de Yahoo se reintenta 3 veces, esperando 2 s, 5 s y 15 s;
//   · un 429 (demasiadas peticiones): se para 60 s y se sigue; si llegan 3 seguidos, se detiene la tanda (código 2) y
//     queda reanudable (lo guardado no se repite);
//   · un 404 (Yahoo no tiene el símbolo: deslistado, renombrado…) no se reintenta: se anota en precios_simbolos con 0 velas
//     y el motivo (solo si el símbolo no estaba; nunca se pisa una fila existente) y no se vuelve a pedir sin --forzar.
//     Una fila así no cambia nada en la app: sin velas ni sesión, la caché sigue yendo a Yahoo como siempre.
//
// A los activos se suman SIEMPRE ^GSPC y los benchmarks: el ticker por defecto de cada filtro de ámbito
// mercado del catálogo (lib/filtros.js) y cualquier `ticker` guardado en los ajustes (user_settings).
// Los filtros de la pantalla viven en el navegador (localStorage) y desde aquí no se ven.
//
// QUÉ HACE, por símbolo:
//   1. Descarga de Yahoo unos 20 años de velas DIARIAS con period1/period2 —no range=max, que devuelve
//      velas trimestrales— y las parsea EXACTAMENTE como fetchAVDetalle (pages/api/datos.js), para que los
//      números sean los que hoy usa el motor.
//   2. Se queda con las velas cerradas (velasCerradas de lib/cachePrecios.js): fuera la de hoy, las
//      futuras y las incompletas. Las descartadas se cuentan con su motivo. Las incoherentes se guardan
//      tal cual (la caché es una copia exacta de lo que usa el motor) y se cuentan como anómalas.
//   3. Las escribe con guardar_velas, NUNCA con un INSERT directo, para que pasen sus validaciones, en una
//      transacción por símbolo.
// Reanudable: salta los símbolos cuya ultima_fecha en precios_simbolos ya está al día.
//
// CÓMO ESCRIBE. Por la Management API, con el mismo token que scripts/backup.js (las funciones de abajo
// están copiadas de allí). La Management API conecta como `postgres`, que no es un usuario de la app, y
// guardar_velas exige auth.uid(). Dentro de CADA transacción se simula al usuario de Sergi, igual que en
// los ensayos del RLS:
//     SET LOCAL ROLE authenticated;
//     SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
// SET LOCAL y set_config(…, true) solo duran hasta el COMMIT. Así la escritura pasa por el mismo camino
// —rol, permisos y validaciones— que usarán las rutas del servidor con el token del usuario.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { preparaEsm, RAIZ } = require('./guardian/cargaEsm')
const NL = String.fromCharCode(10)

// ── Token y proyecto: copiados de scripts/backup.js ──────────────────────────────────────────────────
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
function leeRef() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || (() => {
    try {
      const env = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
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

// ── Opciones ────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const LISTA = opcion('--lista')
const SIMBOLO = opcion('--simbolo')
const ANIOS = Number(opcion('--anios', 20))
const UNIVERSO = opcion('--universo')
const DESDE = opcion('--desde')
const PAUSA = Number(opcion('--pausa', 1000))
const DIAS_AL_DIA = Number(opcion('--dias-al-dia', 4))
const FORZAR = args.includes('--forzar')
// El usuario de Sergi: guardar_velas exige un usuario autenticado.
const USUARIO = 'c006506d-084b-4c2e-a458-70c5caa35d3a'

// ── Base de datos ───────────────────────────────────────────────────────────────────────────────────
let TOKEN = null, REF = null   // se leen al ejecutar (no al cargar el módulo: las pruebas lo cargan sin red)
async function consulta(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const txt = await res.text()
  let datos; try { datos = JSON.parse(txt) } catch (_) { datos = txt }
  if (!res.ok) throw new Error((datos && datos.message) ? datos.message : String(txt).slice(0, 300))
  return datos
}
const lee = (q) => consulta('BEGIN READ ONLY;' + NL + q + NL + 'ROLLBACK;')
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'"
const ETIQUETA = '$velas$'

// ── Yahoo: descarga y parseo IDÉNTICOS a fetchAVDetalle ─────────────────────────────────────────────
async function descargaYahoo(simbolo) {
  const p2 = Math.floor(Date.now() / 1000)
  const p1 = DESDE ? Math.floor(Date.parse(DESDE + 'T00:00:00Z') / 1000) : p2 - Math.round(ANIOS * 365.25 * 86400)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&period1=${p1}&period2=${p2}`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    let desc = ''; try { desc = JSON.parse(txt)?.chart?.error?.description || '' } catch (_) {}
    throw Object.assign(new Error(`Yahoo HTTP ${r.status}${desc ? `: ${desc}` : ''}`), { status: r.status })
  }
  const j = await r.json()
  const timestamps = j?.chart?.result?.[0]?.timestamp
  const quotes = j?.chart?.result?.[0]?.indicators?.quote?.[0]
  if (!timestamps || !quotes) throw new Error(j?.chart?.error?.description || 'Yahoo sin velas')
  // Mismo parseo que pages/api/datos.js (fetchAVDetalle).
  return timestamps.map((t, i) => ({
    date: new Date(t * 1000).toISOString().slice(0, 10),
    open: quotes.open?.[i] || quotes.close?.[i],
    high: quotes.high?.[i] || quotes.close?.[i],
    low: quotes.low?.[i] || quotes.close?.[i],
    close: quotes.close?.[i],
    volume: quotes.volume?.[i] || 0,
  })).filter(d => d.close && !isNaN(d.close))
}

// Por qué se descarta cada vela que velasCerradas no admite (para el informe).
function motivoDescarte(v, hoy, vistas) {
  if (v.enCurso || v.date >= hoy) return 'de hoy o futura'
  if (!['open', 'high', 'low', 'close'].every(c => typeof v[c] === 'number' && Number.isFinite(v[c]))) return 'incompleta'
  if (vistas.has(v.date)) return 'fecha repetida'
  return 'otro'
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms))

// ── Reintentos y 429 ────────────────────────────────────────────────────────────────────────────────
// descarga(simbolo) → velas, o lanza un error con .status. espera(ms) → promesa. estado lleva los 429 seguidos de la
// tanda (se reinicia con cada descarga buena). Devuelve { ok, velas } · { sinDatos, motivo } · { error }; con 3 429
// seguidos lanza un error con .parar = true.
const ESPERAS_REINTENTO = [2000, 5000, 15000], ESPERA_429 = 60000, MAX_429 = 3
async function descargaConReintentos(simbolo, { descarga, espera, estado = { seguidos429: 0 }, log = () => {} }) {
  let intento = 0
  for (;;) {
    try {
      const velas = await descarga(simbolo)
      estado.seguidos429 = 0
      return { ok: true, velas }
    } catch (e) {
      if (e.status === 404) return { ok: false, sinDatos: true, motivo: e.message }
      if (e.status === 429) {
        estado.seguidos429++
        if (estado.seguidos429 >= MAX_429) throw Object.assign(new Error(`Yahoo respondió 429 ${MAX_429} veces seguidas: se detiene la tanda`), { parar: true })
        log(`429: espero ${ESPERA_429 / 1000} s`)
        await espera(ESPERA_429)
        continue
      }
      if (intento >= ESPERAS_REINTENTO.length) return { ok: false, error: e.message }
      log(`reintento ${intento + 1} en ${ESPERAS_REINTENTO[intento] / 1000} s (${e.message})`)
      await espera(ESPERAS_REINTENTO[intento++])
    }
  }
}
module.exports = { descargaConReintentos, ESPERAS_REINTENTO, ESPERA_429, MAX_429 }

if (require.main === module) (async () => {
  TOKEN = leeToken(); REF = leeRef()
  if (!TOKEN) { console.error('No hay sesión con Supabase: ejecuta «npx.cmd supabase login» o define SUPABASE_ACCESS_TOKEN.'); process.exit(1) }
  if (!REF) { console.error('No sé a qué proyecto conectarme: define SUPABASE_URL o deja NEXT_PUBLIC_SUPABASE_URL en .env.local.'); process.exit(1) }
  await preparaEsm()
  const { velasCerradas, esAnomala, aFilasBd } = require(path.join(RAIZ, 'lib', 'cachePrecios.js'))
  const { FILTROS_CATALOGO } = require(path.join(RAIZ, 'lib', 'filtros.js'))
  const t0 = Date.now()

  // Símbolos: activos (watchlist o una lista) + ^GSPC + benchmarks.
  let activos
  if (SIMBOLO) activos = [SIMBOLO]
  else if (UNIVERSO) {
    const [r] = await lee(`SELECT coalesce(json_agg(DISTINCT simbolo_yahoo ORDER BY simbolo_yahoo), '[]') AS d FROM universo_miembros
      WHERE indice = ${lit(UNIVERSO)} AND simbolo_yahoo IS NOT NULL;`)
    activos = r.d
    if (!activos.length) { console.error(`El universo «${UNIVERSO}» no existe o no tiene símbolos de Yahoo.`); process.exit(1) }
  }
  else if (LISTA) {
    const [r] = await lee(`SELECT coalesce(json_agg(DISTINCT w.symbol), '[]') AS d FROM watchlist_list_members m
      JOIN watchlist w ON w.id = m.watchlist_id JOIN watchlist_lists l ON l.id = m.list_id WHERE l.name = ${lit(LISTA)};`)
    activos = r.d
    if (!activos.length) { console.error(`La lista «${LISTA}» no existe o está vacía.`); process.exit(1) }
  } else {
    const [r] = await lee(`SELECT coalesce(json_agg(DISTINCT symbol), '[]') AS d FROM watchlist WHERE coalesce(active, true);`)
    activos = r.d
  }
  const benchmarks = new Set(['^GSPC'])
  for (const def of Object.values(FILTROS_CATALOGO)) {
    const t = def?.params?.mercado?.ticker
    if (t) benchmarks.add(t)
  }
  if (!SIMBOLO && !UNIVERSO) {
    const [r] = await lee(`SELECT coalesce(json_agg(DISTINCT t #>> '{}'), '[]') AS d FROM user_settings,
      jsonb_path_query(settings::jsonb, 'strict $.**.ticker') AS t;`)
    for (const t of r.d) if (t) benchmarks.add(t)
  }
  const simbolos = SIMBOLO ? activos : UNIVERSO ? activos : [...new Set([...activos.sort(), ...benchmarks])]
  console.log(`Caché de precios: ${simbolos.length} símbolos (${activos.length} activos${LISTA ? ` de la lista «${LISTA}»` : ''}${UNIVERSO ? ` del universo ${UNIVERSO}` : ` + benchmarks ${[...benchmarks].join(', ')}`}), ${DESDE ? `desde ${DESDE}` : `${ANIOS} años`}, pausa ${PAUSA} ms`)

  // Estado actual, para saltar los que están al día.
  const [est] = await lee(`SELECT coalesce(json_object_agg(simbolo, json_build_object('ultima', ultima_fecha, 'motivo', motivo_recarga)), '{}') AS d FROM precios_simbolos;`)
  const estado429 = { seguidos429: 0 }
  let parada = null
  const hoy = new Date().toISOString().slice(0, 10)
  const alDia = new Date(Date.now() - DIAS_AL_DIA * 86400000).toISOString().slice(0, 10)

  const filas = []
  let primera = true
  for (const s of simbolos) {
    const ts = Date.now()
    const fila = { simbolo: s, primera: '-', ultima: '-', guardadas: 0, rechazadas: 0, motivos: '', estado: '', ms: 0 }
    try {
      const e0 = est.d[s]
      // Con --universo, cualquier símbolo que ya esté en la caché se salta: los que ya había no se tocan.
      if (UNIVERSO && e0 && !FORZAR) { fila.estado = e0.ultima ? `ya en la caché (${e0.ultima}), saltado` : `ya anotado sin datos, saltado`; filas.push(fila); continue }
      if (!FORZAR && !SIMBOLO && e0?.ultima && e0.ultima >= alDia) { fila.estado = `al día (${e0.ultima}), saltado`; filas.push(fila); continue }
      if (!FORZAR && !SIMBOLO && e0 && !e0.ultima && String(e0.motivo || '').startsWith('sin datos en Yahoo')) { fila.estado = 'anotado sin datos en Yahoo, saltado'; filas.push(fila); continue }
      if (!primera) await pausa(PAUSA)
      primera = false
      const d = await descargaConReintentos(s, { descarga: descargaYahoo, espera: pausa, estado: estado429, log: (m) => console.log(`  ${s.padEnd(10)} ${m}`) })
      if (d.sinDatos) {
        // Se anota (si no estaba) con 0 velas y el motivo: no se vuelve a pedir sin --forzar.
        if (!e0) await consulta(`INSERT INTO public.precios_simbolos (simbolo, velas, recargado_en, motivo_recarga)
          VALUES (${lit(s)}, 0, now(), ${lit('sin datos en Yahoo: ' + d.motivo)}) ON CONFLICT (simbolo) DO NOTHING;`)
        fila.estado = `sin datos en Yahoo (${d.motivo})${e0 ? '' : ', anotado'}`; fila.ms = Date.now() - ts; filas.push(fila)
        console.log(`  ${s.padEnd(10)} ${fila.estado}`)
        continue
      }
      if (d.error) throw new Error(d.error)
      const crudas = d.velas
      const cerradas = velasCerradas(crudas, hoy)
      // Motivos de lo descartado.
      const quedan = new Set(cerradas.map(v => v.date)), vistas = new Set(), motivos = {}
      for (const v of crudas) {
        if (quedan.has(v.date) && !vistas.has(v.date)) { vistas.add(v.date); continue }
        const m = motivoDescarte(v, hoy, vistas); motivos[m] = (motivos[m] || 0) + 1
      }
      fila.rechazadas = crudas.length - cerradas.length
      fila.motivos = Object.entries(motivos).map(([m, n]) => `${n} ${m}`).join(', ')
      if (!cerradas.length) { fila.estado = 'Yahoo sin velas cerradas'; filas.push(fila); continue }
      const json = JSON.stringify(aFilasBd(cerradas))
      if (json.includes(ETIQUETA)) throw new Error('las velas contienen la etiqueta de dollar-quoting')
      // Una transacción por símbolo, como el usuario de Sergi (ver la cabecera).
      const r = await consulta(`BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${USUARIO}","role":"authenticated"}', true);
SELECT public.guardar_velas(${lit(s)}, ${ETIQUETA}${json}${ETIQUETA}::jsonb) AS escritas;
COMMIT;`)
      fila.guardadas = Number(r?.[0]?.escritas ?? cerradas.length)
      fila.primera = cerradas[0].date; fila.ultima = cerradas[cerradas.length - 1].date
      fila.anomalas = cerradas.filter(esAnomala).length
      fila.estado = 'ok'
    } catch (e) {
      if (e.parar) { parada = e.message; fila.estado = 'PARADA: ' + e.message; filas.push(fila); break }
      fila.estado = 'ERROR: ' + String(e.message).replace(/\s+/g, ' ').slice(0, 160)
    }
    fila.ms = Date.now() - ts
    filas.push(fila)
    console.log(`  ${s.padEnd(10)} ${fila.estado === 'ok' ? `${fila.guardadas} velas ${fila.primera} → ${fila.ultima}${fila.anomalas ? ` (${fila.anomalas} anómalas)` : ''}` : fila.estado}${fila.rechazadas ? ` · descartadas ${fila.rechazadas} (${fila.motivos})` : ''} · ${(fila.ms / 1000).toFixed(1)} s`)
  }

  // ── Resumen ──
  console.log('\nSÍMBOLO      PRIMERA     ÚLTIMA      GUARDADAS  DESCARTADAS             TIEMPO  ESTADO')
  for (const f of filas) console.log(`${f.simbolo.padEnd(12)} ${String(f.primera).padEnd(11)} ${String(f.ultima).padEnd(11)} ${String(f.guardadas).padStart(9)}  ${(f.rechazadas ? `${f.rechazadas} (${f.motivos})` : '0').padEnd(22)} ${(f.ms / 1000).toFixed(1).padStart(6)} s  ${f.estado}`)
  const errores = filas.filter(f => f.estado.startsWith('ERROR'))
  console.log(`\n${filas.length} símbolos · ${filas.reduce((s, f) => s + f.guardadas, 0)} velas guardadas · ${errores.length} con error · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (parada) { console.log(`\nTANDA DETENIDA: ${parada}. Vuelve a lanzar el mismo comando para seguir: lo ya guardado se salta.`); process.exit(2) }
  if (errores.length) process.exit(1)
})().catch(e => { console.error('El llenado no ha podido terminar:', e.message); process.exit(1) })
