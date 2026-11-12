// scripts/copias/restaurar.js
//
// RESTAURAR UNA COPIA en la base local (docs/builder.md §133).
//
//   node scripts/copias/restaurar.js <carpeta de la copia> --prueba
//        PRUEBA DE RESTAURACIÓN. No toca tu base: crea una base aparte («restauracion_prueba») en el
//        mismo Postgres, recupera allí la copia ENTERA y compara las filas de cada tabla con el
//        manifiesto; después le aplica el mismo procedimiento que la restauración de verdad y vuelve a
//        comparar (filas y estructura del esquema public); al final la borra.
//
//   node scripts/copias/restaurar.js <carpeta de la copia> --de-verdad
//        Sustituye tus datos por los de la copia. Antes hace una copia de cómo estaba todo en
//        Documentos\TradingSimulator_copias\antes_de_restaurar\<fecha_hora> (para poder deshacerlo
//        restaurando esa). Lo lanza la ventana «Restaurar copia» tras confirmar.
//
// QUÉ SE RESTAURA (y qué no): todo el esquema public (estructura, datos, permisos, políticas,
// funciones, disparadores y el disparador de eventos ensure_rls, §129), los datos de auth.users y
// auth.identities (tu usuario y tu contraseña) y de storage.buckets y storage.objects (las filas de los
// archivos), y los archivos subidos (carpeta almacenamiento). NO se tocan las piezas internas de
// Supabase (sus esquemas, extensiones, migraciones), que crea el propio Supabase al arrancar. Las
// sesiones abiertas se borran: hay que volver a iniciar sesión en la app.
//
// Todo en UNA transacción (psql -1, ON_ERROR_STOP): si algo falla, la base queda como estaba.
// Se ejecuta como supabase_admin (dentro del contenedor, sin contraseña) y con
// session_replication_role = replica, como en la migración del 12/11 (§129).

const fs = require('fs');
const path = require('path');
const os = require('os');
const C = require('./comun');

const BASE_PRUEBA = 'restauracion_prueba';
// Datos de fuera de public que se restauran (el resto de auth y storage es de Supabase).
const DATOS_FUERA = ['auth.users', 'auth.identities', 'storage.buckets', 'storage.objects'];

const fb = (f) => (f || '').split('-').reverse().join('/'); // 2026-11-12 → 12/11/2026
const miles = (n) => n.toLocaleString('es-ES');
function paso(t) { console.log('PASO: ' + t); }
function fallo(msg) { return new Error(msg); }

function sh(cmd) { // dentro del contenedor de la base
  const r = C.docker(['exec', C.CONT_DB, 'sh', '-c', cmd]);
  return r;
}
function psql(db, sql) {
  const r = C.docker(['exec', C.CONT_DB, 'psql', '-U', 'supabase_admin', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  if (r.codigo !== 0) throw fallo(`SQL falló en ${db}: ${r.error.trim()}`);
  return r.salida.trim();
}

const SQL_RECUENTO = `SELECT n.nspname || '.' || c.relname || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('public', 'auth', 'storage') ORDER BY 1`;

function recuento(db) {
  const out = {};
  for (const l of psql(db, SQL_RECUENTO).split(/\r?\n/).filter(Boolean)) {
    const [t, n] = l.split('|');
    out[t] = Number(n);
  }
  return out;
}

// Compara filas con el manifiesto; «tablas» = cuáles mirar.
function comparaFilas(filasManifiesto, filasBase, tablas) {
  const malas = [];
  for (const t of tablas) {
    if (filasBase[t] !== filasManifiesto[t]) malas.push(`${t}: copia ${filasManifiesto[t]}, base ${filasBase[t] === undefined ? 'no existe' : filasBase[t]}`);
  }
  return malas;
}

async function compruebaArchivos(carpeta, manifiesto) {
  for (const a of manifiesto.archivos) {
    const ruta = path.join(carpeta, ...a.archivo.split('/'));
    if (!fs.existsSync(ruta)) throw fallo(`falta ${a.archivo} en la copia`);
    if ((await C.sha256Archivo(ruta)) !== a.sha256) throw fallo(`${a.archivo} está estropeado (no coincide con su huella)`);
  }
}

// Qué entradas del volcado recupera la restauración de verdad.
function entradasRestaurar(toc) {
  const fuera = new Set(DATOS_FUERA.map((t) => t.replace('.', ' ')));
  return toc.split(/\r?\n/).filter((l) => {
    if (!l || l.startsWith(';')) return false;
    const m = l.match(/^\d+; \d+ \d+ ((?:[A-Z]+ )+)(\S+) (.*)$/);
    if (!m) return false;
    const tipo = m[1].trim();
    const esq = m[2];
    const resto = m[3];
    if (esq === 'public') return true; // incluidos sus permisos por defecto (DEFAULT ACL), que van al final
    if (tipo === 'TABLE DATA' && fuera.has(`${esq} ${resto.split(' ')[0]}`)) return true;
    return false;
  });
}

// El disparador de eventos ensure_rls (§129): Supabase no deja que lo cree un superusuario si su función
// es de postgres («Superuser owned event trigger must execute a superuser owned function»), así que se
// crea como postgres (SET ROLE), igual que en la migración. Devuelve su SQL ya envuelto.
function sqlEnsureRls(toc, dumpEnContenedor) {
  const linea = toc.split(/\r?\n/).find((l) => / EVENT TRIGGER - ensure_rls /.test(l));
  if (!linea) return '';
  const lista = `/tmp/restaurar_et_${process.pid}.txt`;
  const r = sh(`echo '${linea.replace(/'/g, '')}' > ${lista} && pg_restore -L ${lista} -f - ${dumpEnContenedor}; rm -f ${lista}`);
  if (r.codigo !== 0 || !/CREATE EVENT TRIGGER/.test(r.salida)) throw fallo(`no se pudo leer ensure_rls del volcado: ${r.error.trim()}`);
  return `\nSET ROLE postgres;\n${r.salida}\nRESET ROLE;\n`;
}

// Borra lo que hay en public (sin tocar el esquema, sus permisos ni lo de las extensiones) y los datos
// que se van a recuperar de auth y storage. Va delante del SQL de pg_restore, en la misma transacción.
const SQL_PREVIO = `SET session_replication_role = replica;
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DO $restaurar$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') LOOP
    EXECUTE format('DROP %s IF EXISTS public.%I CASCADE',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'S'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE 'DROP ROUTINE IF EXISTS ' || r.f || ' CASCADE';
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND (t.typtype IN ('e','d') OR (t.typtype = 'c' AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'c')))
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e') LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END
$restaurar$;
TRUNCATE ${DATOS_FUERA.join(', ')} CASCADE;
-- Permisos por defecto de public: fuera mientras se crean las piezas (si no, cada función nueva recibiría
-- además los permisos por defecto, p. ej. a anon, y no quedaría igual que en la copia). El volcado los
-- vuelve a poner al final (entradas DEFAULT ACL), como estaban en la copia.
DO $permisos$
DECLARE r record;
BEGIN
  FOR r IN SELECT pg_get_userbyid(d.defaclrole) AS rol, d.defaclobjtype AS tipo
           FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM %s',
      r.rol,
      CASE r.tipo WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END,
      (SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END, ', ')
         FROM pg_default_acl d2, aclexplode(d2.defaclacl) a
        WHERE d2.defaclnamespace = 'public'::regnamespace AND pg_get_userbyid(d2.defaclrole) = r.rol AND d2.defaclobjtype = r.tipo));
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_default_acl WHERE defaclnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'no se pudieron quitar los permisos por defecto de public';
  END IF;
END
$permisos$;
`;

// El procedimiento de la restauración de verdad, sobre la base «db». dumpEnContenedor = ruta del volcado
// dentro del contenedor.
function procedimiento(db, dumpEnContenedor) {
  const pre = `/tmp/restaurar_${process.pid}`;
  const toc = sh(`pg_restore -l ${dumpEnContenedor}`);
  if (toc.codigo !== 0) throw fallo(`no se puede leer el volcado: ${toc.error.trim()}`);
  const lista = entradasRestaurar(toc.salida);
  if (!lista.some((l) => / TABLE DATA public strategies /.test(l))) throw fallo('el volcado no trae public.strategies');
  for (const t of DATOS_FUERA) {
    if (!lista.some((l) => l.includes(` TABLE DATA ${t.replace('.', ' ')} `))) throw fallo(`el volcado no trae los datos de ${t}`);
  }
  const tmpHost = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurar-'));
  try {
    fs.writeFileSync(path.join(tmpHost, 'lista.txt'), lista.join('\n') + '\n');
    fs.writeFileSync(path.join(tmpHost, 'previo.sql'), SQL_PREVIO);
    fs.writeFileSync(path.join(tmpHost, 'final.sql'), sqlEnsureRls(toc.salida, dumpEnContenedor));
    for (const n of ['lista.txt', 'previo.sql', 'final.sql']) {
      const cp = C.docker(['cp', path.join(tmpHost, n), `${C.CONT_DB}:${pre}_${n}`]);
      if (cp.codigo !== 0) throw fallo(`docker cp falló: ${cp.error.trim()}`);
    }
  } finally {
    fs.rmSync(tmpHost, { recursive: true, force: true });
  }
  try {
    const g = sh(`pg_restore -L ${pre}_lista.txt -f ${pre}_datos.sql ${dumpEnContenedor} && cat ${pre}_previo.sql ${pre}_datos.sql ${pre}_final.sql > ${pre}_todo.sql`);
    if (g.codigo !== 0) throw fallo(`no se pudo preparar la restauración: ${g.error.trim()}`);
    const r = C.docker(['exec', C.CONT_DB, 'psql', '-U', 'supabase_admin', '-d', db, '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-f', `${pre}_todo.sql`]);
    if (r.codigo !== 0) throw fallo(`la restauración falló y NO se ha cambiado nada: ${r.error.trim().split(/\r?\n/).slice(-3).join(' ')}`);
    return lista.length;
  } finally {
    sh(`rm -f ${pre}_lista.txt ${pre}_previo.sql ${pre}_datos.sql ${pre}_final.sql ${pre}_todo.sql`);
  }
}

function estructuraPublic(db) {
  const r = C.docker(['exec', C.CONT_DB, 'pg_dump', '-U', 'supabase_admin', '-d', db, '-s', '-n', 'public']);
  if (r.codigo !== 0) throw fallo(`pg_dump -s falló: ${r.error.trim()}`);
  // Fuera la línea \restrict (cambia en cada volcado) y los comentarios de cabecera.
  return r.salida.split(/\r?\n/).filter((l) => !/^\\(un)?restrict /.test(l) && !/^-- Dumped (from|by) /.test(l)).join('\n');
}

function tablasPublic(manifiesto) { return Object.keys(manifiesto.filas).filter((t) => t.startsWith('public.')); }

async function prueba(carpeta, manifiesto) {
  const dump = `/tmp/restaurar_prueba_${process.pid}.dump`;
  paso('Comprobando los archivos de la copia…');
  await compruebaArchivos(carpeta, manifiesto);
  const cp = C.docker(['cp', path.join(carpeta, 'base.dump'), `${C.CONT_DB}:${dump}`]);
  if (cp.codigo !== 0) throw fallo(`docker cp falló: ${cp.error.trim()}`);
  try {
    psql('postgres', `DROP DATABASE IF EXISTS ${BASE_PRUEBA} WITH (FORCE)`);
    psql('postgres', `CREATE DATABASE ${BASE_PRUEBA}`);

    paso(`1) Copia ENTERA en una base aparte (${BASE_PRUEBA})…`);
    const r = C.docker(['exec', C.CONT_DB, 'pg_restore', '-U', 'supabase_admin', '-d', BASE_PRUEBA, dump]);
    // ensure_rls falla como superusuario (ver sqlEnsureRls): se crea aparte como postgres.
    const errores = r.error.split(/\r?\n/).filter((l) => /^pg_restore: error:/.test(l) && !/event trigger|ensure_rls/i.test(l));
    const et = sqlEnsureRls(sh(`pg_restore -l ${dump}`).salida, dump);
    if (et) {
      const e2 = C.docker(['exec', '-i', C.CONT_DB, 'psql', '-U', 'supabase_admin', '-d', BASE_PRUEBA, '-q', '-v', 'ON_ERROR_STOP=1'], { input: et });
      if (e2.codigo !== 0) throw fallo(`no se pudo crear ensure_rls en la base aparte: ${e2.error.trim()}`);
    }
    if (psql(BASE_PRUEBA, "SELECT count(*) FROM pg_event_trigger WHERE evtname = 'ensure_rls'") !== '1') throw fallo('ensure_rls no quedó creado en la base aparte');
    if (errores.length) paso(`   pg_restore avisó de ${errores.length} cosas (piezas internas de Supabase; se comprueban las filas): ${errores.slice(0, 3).join(' | ')}`);
    const filas1 = recuento(BASE_PRUEBA);
    const malas1 = comparaFilas(manifiesto.filas, filas1, Object.keys(manifiesto.filas));
    if (malas1.length) throw fallo(`la copia entera NO cuadra con el manifiesto: ${malas1.join('; ')}`);
    const total = Object.values(manifiesto.filas).reduce((a, b) => a + b, 0);
    paso(`   ✓ ${Object.keys(manifiesto.filas).length} tablas y ${miles(total)} filas, iguales al manifiesto`);
    const antes = estructuraPublic(BASE_PRUEBA);

    paso('2) El procedimiento de «Restaurar» sobre esa base aparte…');
    const n = procedimiento(BASE_PRUEBA, dump);
    const filas2 = recuento(BASE_PRUEBA);
    const tablas = [...tablasPublic(manifiesto), ...DATOS_FUERA];
    const malas2 = comparaFilas(manifiesto.filas, filas2, tablas);
    if (malas2.length) throw fallo(`tras «Restaurar», las filas NO cuadran: ${malas2.join('; ')}`);
    if (psql(BASE_PRUEBA, "SELECT count(*) FROM pg_event_trigger WHERE evtname = 'ensure_rls' AND evtenabled = 'O'") !== '1') throw fallo('tras «Restaurar», falta el disparador ensure_rls');
    const despues = estructuraPublic(BASE_PRUEBA);
    if (antes !== despues) {
      const a = antes.split('\n'); const d = despues.split('\n');
      const i = a.findIndex((l, k) => l !== d[k]);
      throw fallo(`tras «Restaurar», la estructura de public cambia (línea ${i + 1}: «${a[i]}» → «${d[i]}»)`);
    }
    paso(`   ✓ ${n} piezas recuperadas; ${tablas.length} tablas con las filas del manifiesto y la estructura de public idéntica`);
    // Informativo: ¿la estructura restaurada es la de tu base de ahora? (si cambió algo después de la
    // copia, es normal que no).
    const ahora = estructuraPublic('postgres');
    paso(despues === ahora ? '   ✓ y la estructura es la misma que la de tu base de ahora (tablas, permisos, políticas, funciones)'
      : '   · la estructura no es la de tu base de ahora (normal si algo cambió después de la copia)');
    return { tablas: Object.keys(manifiesto.filas).length, total };
  } finally {
    try { psql('postgres', `DROP DATABASE IF EXISTS ${BASE_PRUEBA} WITH (FORCE)`); } catch (_) {}
    sh(`rm -f ${dump}`);
  }
}

function sello() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${C.hoyLocal(d)}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function deVerdad(carpeta, manifiesto) {
  paso('Comprobando los archivos de la copia…');
  await compruebaArchivos(carpeta, manifiesto);

  paso('Guardando cómo está todo ahora (para poder deshacerlo)…');
  const { copia } = require('./copiaDiaria');
  const antes = path.join(C.RAIZ_COPIAS, 'antes_de_restaurar', sello());
  await copia(C.hoyLocal(), antes);
  paso(`   ✓ guardado en ${antes}`);

  const dump = `/tmp/restaurar_${process.pid}.dump`;
  const cp = C.docker(['cp', path.join(carpeta, 'base.dump'), `${C.CONT_DB}:${dump}`]);
  if (cp.codigo !== 0) throw fallo(`docker cp falló: ${cp.error.trim()}`);
  try {
    paso('Restaurando la base (todo o nada)…');
    procedimiento('postgres', dump);
  } finally {
    sh(`rm -f ${dump}`);
  }

  // Archivos subidos (adjuntos de las tesis).
  const alm = path.join(carpeta, 'almacenamiento');
  if (fs.existsSync(alm)) {
    if (!C.contenedorEncendido(C.CONT_STORAGE)) throw fallo('la base ya está restaurada, pero el almacenamiento de archivos está apagado: los adjuntos NO se han restaurado');
    paso('Restaurando los archivos subidos…');
    const b = C.docker(['exec', C.CONT_STORAGE, 'sh', '-c', 'rm -rf /mnt/* /mnt/.[!.]* 2>/dev/null; true']);
    if (b.codigo !== 0) throw fallo(`no se pudo vaciar el almacenamiento: ${b.error.trim()}`);
    const c = C.docker(['cp', alm + path.sep + '.', `${C.CONT_STORAGE}:/mnt/`]);
    if (c.codigo !== 0) throw fallo(`no se pudieron copiar los archivos subidos: ${c.error.trim()}`);
  }

  paso('Comprobando las filas…');
  const filas = recuento('postgres');
  const tablas = [...tablasPublic(manifiesto), ...DATOS_FUERA];
  const malas = comparaFilas(manifiesto.filas, filas, tablas);
  if (malas.length) throw fallo(`restaurada, pero las filas NO cuadran con la copia: ${malas.join('; ')}. Tienes cómo estaba en ${antes}`);
  C.anotaRegistro(C.RAIZ_COPIAS, `RESTAURADA la copia ${carpeta} (${tablas.length} tablas iguales al manifiesto); antes, en ${antes}`);
  return { tablas: tablas.length, antes };
}

// Copias que se pueden restaurar: las diarias del PC, las «antes de restaurar» y, si se da una carpeta
// (un USB, por ejemplo), las de esa carpeta (o de su TradingSimulator_copias, o ella misma si es una copia).
function listar(otra) {
  const lista = [];
  const mira = (dir, tipo) => {
    if (!dir || !fs.existsSync(dir)) return;
    if (fs.existsSync(path.join(dir, 'manifiesto.json'))) { añade(dir, tipo); return; }
    for (const n of fs.readdirSync(dir).sort().reverse()) {
      const ruta = path.join(dir, n);
      if (/^\d{4}-\d{2}-\d{2}(_\d{6})?$/.test(n) && fs.existsSync(path.join(ruta, 'manifiesto.json'))) añade(ruta, tipo);
    }
  };
  const añade = (ruta, tipo) => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(ruta, 'manifiesto.json'), 'utf8'));
      lista.push({
        ruta, tipo, fecha: m.fecha, hecha: m.hecha,
        filas: Object.values(m.filas || {}).reduce((a, b) => a + b, 0),
        mb: Math.round((m.archivos || []).reduce((a, b) => a + b.bytes, 0) / 1048576),
      });
    } catch (_) { /* manifiesto ilegible: no se ofrece */ }
  };
  if (otra) {
    const abs = path.resolve(otra);
    const sub = path.join(abs, 'TradingSimulator_copias');
    mira(fs.existsSync(sub) ? sub : abs, 'elegida');
  }
  mira(C.DIARIAS, 'PC');
  mira(path.join(C.RAIZ_COPIAS, 'antes_de_restaurar'), 'antes de restaurar');
  return lista;
}

async function main() {
  if (process.argv[2] === 'listar') { console.log(JSON.stringify(listar(process.argv[3]))); return 0; }
  const carpeta = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const modo = process.argv.includes('--de-verdad') ? 'verdad' : process.argv.includes('--prueba') ? 'prueba' : null;
  if (!carpeta || !modo) {
    console.error('Uso: node scripts/copias/restaurar.js <carpeta de la copia> --prueba | --de-verdad');
    return 2;
  }
  try {
    const mf = path.join(carpeta, 'manifiesto.json');
    if (!fs.existsSync(mf)) throw fallo(`${carpeta} no es una copia (no tiene manifiesto.json)`);
    const manifiesto = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (!C.contenedorEncendido(C.CONT_DB)) throw fallo('la base local está apagada: enciende Supabase primero');
    if (modo === 'prueba') {
      const r = await prueba(carpeta, manifiesto);
      console.log(`OK: La copia del ${fb(manifiesto.fecha)} se restaura entera (${r.tablas} tablas, ${miles(r.total)} filas) y «Restaurar» funciona con ella. Tu base no se ha tocado.`);
      C.anotaRegistro(C.RAIZ_COPIAS, `PRUEBA DE RESTAURACIÓN OK: ${carpeta}`);
    } else {
      const r = await deVerdad(carpeta, manifiesto);
      console.log(`OK: Restaurada la copia del ${fb(manifiesto.fecha)} (${r.tablas} tablas iguales a la copia). Vuelve a iniciar sesión en la app. Cómo estaba antes: ${r.antes}`);
    }
    return 0;
  } catch (e) {
    if (modo === 'prueba') C.anotaRegistro(C.RAIZ_COPIAS, `PRUEBA DE RESTAURACIÓN FALLO: ${carpeta}: ${e.message}`);
    else C.anotaRegistro(C.RAIZ_COPIAS, `RESTAURAR FALLO: ${carpeta}: ${e.message}`);
    console.log('FALLO: ' + e.message);
    return 1;
  }
}

if (require.main === module) main().then((c) => { process.exitCode = c; });
module.exports = { entradasRestaurar };
