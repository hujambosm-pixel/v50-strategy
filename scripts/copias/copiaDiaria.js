// scripts/copias/copiaDiaria.js
//
// COPIA DIARIA de la base local (docs/builder.md §130).
//
//   node scripts/copias/copiaDiaria.js            copia si la base está encendida y aún no hay copia de hoy
//   node scripts/copias/copiaDiaria.js --forzar   copia aunque ya haya una de hoy (la sustituye)
//
// La lanza sola una tarea programada de Windows al iniciar sesión y cada hora (instalaTarea.ps1),
// sin ventana (copiaDiaria.vbs). Si la base no está encendida no hace nada: si no se encendió, los datos
// no han cambiado y la copia de la última vez sigue valiendo.
//
// QUÉ GUARDA, en Documentos\TradingSimulator_copias\diarias\AAAA-MM-DD\:
//   base.dump             TODA la base (pg_dump -Fc): esquema public con datos, auth (tu usuario),
//                         storage (filas de los archivos de las tesis) y lo demás de Supabase.
//                         Al restaurar se elige qué parte se recupera (pg_restore -n / -t).
//   almacenamiento/       los archivos subidos a la app (adjuntos de las tesis), tal cual.
//   config/               .env.local (claves de la base LOCAL), config.toml y signing_keys.json de
//                         Supabase local: sin ellos, una base restaurada no reconoce tu sesión.
//   CLAUDE.local.md, bocetos/   la memoria entre sesiones y los bocetos (no están en GitHub).
//   manifiesto.json       filas de cada tabla (contadas en la MISMA foto que el volcado) y sha256 de
//                         cada archivo. Es lo que comprueba la prueba de restauración.
// NO guarda el código (está en GitHub), node_modules, .next ni Docker.
//
// La copia se escribe en «AAAA-MM-DD.enCurso» y solo se renombra al final, con todo comprobado: una
// copia a medias nunca pasa por buena. Se guardan las 14 últimas.
//
// ⚠  MATERIAL SENSIBLE Y SIN CIFRAR (decisión de Sergi: el USB está en casa): user_settings lleva
// claves en claro (Groq), trades_log es la cartera real. Nunca dentro del repositorio.

const fs = require('fs');
const path = require('path');
const C = require('./comun');

const FORZAR = process.argv.includes('--forzar');

function fallo(msg) { const e = new Error(msg); e.esFallo = true; return e; }

// Abre una transacción de solo lectura en la base y exporta su foto (snapshot): el volcado y el
// recuento de filas salen de la MISMA foto, aunque la app esté escribiendo mientras tanto.
function abrePsql() {
  const hijo = C.spawn(C.rutaDocker(), ['exec', '-i', C.CONT_DB, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-At', '-q', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true });
  let buf = '';
  let errores = '';
  const esperas = [];
  hijo.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const linea = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      for (const w of esperas) w.lineas.push(linea);
      for (const w of [...esperas]) if (w.hasta(linea)) { esperas.splice(esperas.indexOf(w), 1); w.ok(w.lineas); }
    }
  });
  hijo.stderr.on('data', (d) => { errores += d.toString('utf8'); });
  const terminado = new Promise((res) => hijo.on('close', (c) => {
    for (const w of esperas) w.ko(fallo(`psql terminó (${c}): ${errores.trim()}`));
    res(c);
  }));
  return {
    // Manda SQL y espera hasta la línea que cumpla «hasta».
    pide(sql, hasta) {
      return new Promise((ok, ko) => {
        esperas.push({ hasta, ok, ko, lineas: [] });
        hijo.stdin.write(sql + '\n');
      });
    },
    async cierra() { hijo.stdin.write('COMMIT;\n\\q\n'); hijo.stdin.end(); await terminado; },
    errores: () => errores,
  };
}

const SQL_RECUENTO = `SELECT 'N:' || n.nspname || '.' || c.relname || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('public', 'auth', 'storage')
ORDER BY 1;
\\echo FIN`;

function copiaArchivo(origen, destino) {
  if (!fs.existsSync(origen)) return false;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
  return true;
}

function copiaCarpeta(origen, destino) {
  if (!fs.existsSync(origen)) return false;
  fs.cpSync(origen, destino, { recursive: true });
  return true;
}

function borraCarpeta(ruta) { fs.rmSync(ruta, { recursive: true, force: true }); }

// «final» distinto lo usa restaurar.js para la copia de seguridad previa (antes_de_restaurar\…).
async function copia(dia, final = path.join(C.DIARIAS, dia)) {
  const enCurso = final + '.enCurso';
  borraCarpeta(enCurso);
  fs.mkdirSync(enCurso, { recursive: true });
  const t0 = Date.now();
  const aviso = [];

  // 1) Foto de la base + volcado con esa foto + recuento con esa foto.
  const psql = abrePsql();
  let recuento;
  const tmp = `/tmp/copia_diaria_${process.pid}.dump`;
  try {
    const snap = await psql.pide(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'SNAP:' || pg_export_snapshot();`, (l) => l.startsWith('SNAP:'));
    const idFoto = snap.find((l) => l.startsWith('SNAP:')).slice(5);

    const d = C.docker(['exec', C.CONT_DB, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc',
      `--snapshot=${idFoto}`, '-f', tmp]);
    if (d.codigo !== 0) throw fallo(`pg_dump falló: ${d.error.trim()}`);

    const filas = await psql.pide(SQL_RECUENTO, (l) => l === 'FIN');
    recuento = {};
    for (const l of filas) {
      if (!l.startsWith('N:')) continue;
      const [tabla, n] = l.slice(2).split('|');
      recuento[tabla] = Number(n);
    }
  } finally {
    await psql.cierra();
  }
  if (!recuento || !Object.keys(recuento).length) throw fallo('el recuento de filas salió vacío');
  if (!recuento['public.strategies']) throw fallo('el recuento no ve public.strategies: algo va mal');

  // 2) El volcado se puede leer: pg_restore lista su contenido. Contamos las tablas con datos.
  const l = C.docker(['exec', C.CONT_DB, 'pg_restore', '-l', tmp]);
  if (l.codigo !== 0) { C.docker(['exec', C.CONT_DB, 'rm', '-f', tmp]); throw fallo(`el volcado no se puede leer: ${l.error.trim()}`); }
  const datosEnVolcado = l.salida.split(/\r?\n/).filter((x) => / TABLE DATA /.test(x));
  for (const tabla of Object.keys(recuento)) {
    const [esq, nom] = tabla.split('.');
    if (!datosEnVolcado.some((x) => x.includes(` TABLE DATA ${esq} ${nom} `))) throw fallo(`el volcado no trae los datos de ${tabla}`);
  }

  // 3) Al disco del PC.
  const destDump = path.join(enCurso, 'base.dump');
  const cp = C.docker(['cp', `${C.CONT_DB}:${tmp}`, destDump]);
  C.docker(['exec', C.CONT_DB, 'rm', '-f', tmp]);
  if (cp.codigo !== 0) throw fallo(`no se pudo sacar el volcado: ${cp.error.trim()}`);

  // 4) Archivos subidos a la app (adjuntos de las tesis).
  const alm = path.join(enCurso, 'almacenamiento');
  fs.mkdirSync(alm, { recursive: true });
  if (C.contenedorEncendido(C.CONT_STORAGE)) {
    const s = C.docker(['cp', `${C.CONT_STORAGE}:/mnt/.`, alm]);
    if (s.codigo !== 0) throw fallo(`no se pudieron copiar los archivos subidos: ${s.error.trim()}`);
  } else {
    aviso.push('el almacenamiento de archivos estaba apagado: esta copia no trae los adjuntos');
  }

  // 5) Configuración y lo que no está en GitHub.
  const cfg = path.join(enCurso, 'config');
  if (!copiaArchivo(path.join(C.REPO, '.env.local'), path.join(cfg, '.env.local'))) aviso.push('falta .env.local');
  if (!copiaArchivo(path.join(C.SUPABASE_LOCAL, 'config.toml'), path.join(cfg, 'supabase', 'config.toml'))) aviso.push('falta config.toml de Supabase local');
  if (!copiaArchivo(path.join(C.SUPABASE_LOCAL, 'signing_keys.json'), path.join(cfg, 'supabase', 'signing_keys.json'))) aviso.push('falta signing_keys.json de Supabase local');
  copiaArchivo(path.join(C.REPO, 'CLAUDE.local.md'), path.join(enCurso, 'CLAUDE.local.md'));
  copiaCarpeta(path.join(C.REPO, 'bocetos'), path.join(enCurso, 'bocetos'));

  // 6) Manifiesto con la huella de cada archivo.
  const archivos = await C.inventario(enCurso);
  let version = '';
  try { version = require(path.join(C.REPO, 'package.json')).version || ''; } catch (_) {}
  const dockerVersion = C.docker(['--version']);
  const manifiesto = {
    tipo: 'copia diaria',
    fecha: dia,
    hecha: new Date().toISOString(),
    segundos: Math.round((Date.now() - t0) / 1000),
    versionApp: version,
    docker: dockerVersion.salida.trim(),
    filas: recuento,
    totalFilas: Object.values(recuento).reduce((a, b) => a + b, 0),
    avisos: aviso,
    archivos,
  };
  fs.writeFileSync(path.join(enCurso, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2));

  // 7) Comprobación final: lo escrito en el disco es lo del manifiesto.
  for (const a of archivos) {
    const h = await C.sha256Archivo(path.join(enCurso, ...a.archivo.split('/')));
    if (h !== a.sha256) throw fallo(`${a.archivo} no coincide con su huella`);
  }

  // 8) Ya es una copia buena: ocupa su sitio (si se forzó, sustituye a la de hoy).
  if (fs.existsSync(final)) borraCarpeta(final);
  fs.renameSync(enCurso, final);
  return manifiesto;
}

function poda() {
  const buenas = C.copiasCompletas(C.DIARIAS);
  for (const vieja of buenas.slice(C.GUARDAR_DIARIAS)) borraCarpeta(path.join(C.DIARIAS, vieja));
  // Restos de copias a medias de otros días.
  const hoy = C.hoyLocal();
  for (const n of fs.readdirSync(C.DIARIAS)) {
    if (n.endsWith('.enCurso') && n.slice(0, 10) < hoy) borraCarpeta(path.join(C.DIARIAS, n));
  }
}

function guardaEstado(estado) {
  try { fs.writeFileSync(path.join(C.DIARIAS, '_estado.json'), JSON.stringify(estado, null, 2)); } catch (_) {}
}

async function main() {
  fs.mkdirSync(C.DIARIAS, { recursive: true });
  const dia = C.hoyLocal();
  if (!FORZAR && C.copiasCompletas(C.DIARIAS).includes(dia)) return 0; // ya hay copia de hoy: nada
  if (!C.contenedorEncendido(C.CONT_DB)) return 0; // la base no se ha usado: nada que copiar

  try {
    const m = await copia(dia);
    poda();
    const mb = (m.archivos.reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(1);
    const txt = `OK ${dia}: ${m.totalFilas} filas en ${Object.keys(m.filas).length} tablas, ${m.archivos.length} archivos, ${mb} MB, ${m.segundos} s` +
      (m.avisos.length ? ` · avisos: ${m.avisos.join('; ')}` : '');
    C.anotaRegistro(C.DIARIAS, txt);
    guardaEstado({ ultimoIntento: new Date().toISOString(), resultado: 'ok', copia: dia, mensaje: txt });
    console.log(txt);
    return 0;
  } catch (e) {
    const txt = `FALLO ${dia}: ${e.message}`;
    C.anotaRegistro(C.DIARIAS, txt);
    guardaEstado({ ultimoIntento: new Date().toISOString(), resultado: 'fallo', copia: null, mensaje: txt });
    console.error(txt);
    return 1;
  }
}

if (require.main === module) main().then((c) => { process.exitCode = c; });
module.exports = { copia };
