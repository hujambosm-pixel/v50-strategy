// scripts/lanzador/lanzador.js
//
// LANZADOR de Trading Simulator en este PC (docs/builder.md §134). Lo usan los accesos directos del
// Escritorio «Trading Simulator» y «Parar Trading Simulator» (ventana.ps1); también a mano:
//
//   node scripts/lanzador/lanzador.js arrancar [--sin-navegador]
//        Docker Desktop → Supabase local → postgres-meta → la app (next start; antes `npm run build`
//        si cambió algo de la app o .env.local desde la última compilación) → abre http://localhost:3000.
//        Lo que ya está encendido se deja como está: se puede pulsar dos veces sin problema.
//   node scripts/lanzador/lanzador.js parar
//        Copia diaria si aún no hay de hoy → para la app → postgres-meta → Supabase (los datos se
//        quedan en Docker) → Docker Desktop (libera la memoria de WSL).
//   node scripts/lanzador/lanzador.js estado      qué está encendido (JSON)
//
// Escribe una línea «PASO: …» por paso, y al final «OK: …» o «FALLO: …» (la ventana las enseña).

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const C = require('../copias/comun');

const DIR_SUPABASE = path.dirname(C.SUPABASE_LOCAL); // %USERPROFILE%\TradingSimulator_local
const SUPABASE_CLI = 'supabase@3.1.0';
const EXCLUIDOS = 'imgproxy,mailpit,supavisor,vector,logflare,studio,realtime,edge-runtime';
const CONT_META = 'supabase_meta_TradingSimulator_local';
const PUERTO_APP = 3000;
const URL_APP = `http://localhost:${PUERTO_APP}`;
const DOCKER_DESKTOP = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
const LOG_APP = path.join(os.tmpdir(), 'trading-simulator-app.log');

function paso(t) { console.log('PASO: ' + t); }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function hasta(cond, segundos, cada = 2000) {
  const fin = Date.now() + segundos * 1000;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await espera(cada);
  }
  return false;
}

function puertoAbierto(puerto) {
  return new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port: puerto });
    s.setTimeout(1500);
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.on('timeout', () => { s.destroy(); res(false); });
  });
}

// ¿Responde algo HTTP? (cualquier código vale: basta con que conteste)
function responde(url) {
  return new Promise((res) => {
    const r = http.get(url, (resp) => { resp.resume(); res(true); });
    r.setTimeout(4000, () => { r.destroy(); res(false); });
    r.on('error', () => res(false));
  });
}

function dockerVivo() { return C.docker(['info', '--format', '{{.ServerVersion}}']).codigo === 0; }

// npx es un .cmd: hay que pasar por cmd.exe.
function supabaseCli(args, segundos) {
  return spawnSync('cmd.exe', ['/d', '/s', '/c', `npx --yes ${SUPABASE_CLI} ${args}`],
    { cwd: DIR_SUPABASE, windowsHide: true, encoding: 'utf8', timeout: segundos * 1000, maxBuffer: 16 * 1024 * 1024 });
}

async function estado() {
  const docker = dockerVivo();
  return {
    docker,
    base: docker && C.contenedorEncendido(C.CONT_DB),
    meta: docker && C.contenedorEncendido(CONT_META),
    app: await puertoAbierto(PUERTO_APP),
  };
}

// ¿Hay que recompilar? Sí si no hay compilación, si .env.local es más nuevo (las NEXT_PUBLIC se
// graban al compilar) o si algún commit posterior a la compilación tocó archivos de la app (no
// cuentan scripts/, docs/, sql/, bocetos/, los .md…).
function hayQueCompilar() {
  const id = path.join(C.REPO, '.next', 'BUILD_ID');
  if (!fs.existsSync(id)) return 'no hay ninguna compilación';
  const cuando = fs.statSync(id).mtimeMs;
  const env = path.join(C.REPO, '.env.local');
  if (fs.existsSync(env) && fs.statSync(env).mtimeMs > cuando) return '.env.local ha cambiado';
  const git = (args) => spawnSync('git', ['-C', C.REPO, ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout || '';
  // Commits desde la compilación: si la hizo el lanzador, anotó el commit (exacto); si no (p. ej. la
  // de comunes.sh), los commits posteriores a la hora de BUILD_ID (puede pedir una compilación de más).
  const marca = path.join(C.REPO, '.next', '_lanzador_commit.txt');
  let commits;
  if (fs.existsSync(marca) && fs.statSync(marca).mtimeMs >= cuando) {
    commits = git(['rev-list', `${fs.readFileSync(marca, 'utf8').trim()}..HEAD`]);
  } else {
    commits = git(['log', `--since=${Math.floor(cuando / 1000)}`, '--format=%H']);
  }
  const tocados = new Set();
  for (const h of commits.split(/\r?\n/).filter(Boolean)) {
    for (const f of git(['show', '--name-only', '--format=', h]).split(/\r?\n/).filter(Boolean)) {
      if (/^(scripts|docs|sql|bocetos|backups|\.claude)\//.test(f) || /\.md$/i.test(f) || f === '.gitignore') continue;
      // El gancho de versión cambia pages/index.js en CADA commit: si solo cambió esa línea, no cuenta
      // (si no, cada commit de scripts obligaría a recompilar; el número de la app puede ir algo atrás).
      if (f === 'pages/index.js') {
        const cambios = git(['show', '--format=', '--unified=0', h, '--', f]).split(/\r?\n/)
          .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
        if (cambios.every((l) => /Trading Simulator V\d+\.\d+/.test(l))) continue;
      }
      tocados.add(f);
    }
  }
  const lista = [...tocados];
  if (lista.length) return `hay cambios en la app (${lista.slice(0, 3).join(', ')}${lista.length > 3 ? '…' : ''})`;
  return null;
}

function compila() {
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'],
    { cwd: C.REPO, windowsHide: true, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(os.tmpdir(), 'trading-simulator-build.log'), (r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) throw new Error(`no se pudo preparar la app (npm run build). Detalle en ${path.join(os.tmpdir(), 'trading-simulator-build.log')}`);
  const cabeza = spawnSync('git', ['-C', C.REPO, 'rev-parse', 'HEAD'], { windowsHide: true, encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(C.REPO, '.next', '_lanzador_commit.txt'), cabeza);
}

function arrancaApp() {
  const salida = fs.openSync(LOG_APP, 'a');
  const hijo = spawn(process.execPath, [path.join(C.REPO, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', C.REPO],
    { cwd: C.REPO, detached: true, stdio: ['ignore', salida, salida], windowsHide: true });
  hijo.unref();
}

function abreNavegador() {
  spawn('cmd.exe', ['/d', '/c', 'start', '""', URL_APP], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function arrancar(conNavegador) {
  // 1) Docker Desktop
  if (dockerVivo()) paso('Docker ya estaba encendido');
  else {
    paso('Encendiendo Docker (hasta 2–3 minutos)…');
    const d = C.docker(['desktop', 'start', '--detach']);
    if (d.codigo !== 0 && fs.existsSync(DOCKER_DESKTOP)) {
      spawn(DOCKER_DESKTOP, [], { detached: true, stdio: 'ignore' }).unref();
    }
    if (!(await hasta(dockerVivo, 240, 3000))) throw new Error('Docker no ha arrancado en 4 minutos. Ábrelo a mano (Docker Desktop) y vuelve a probar.');
    paso('   ✓ Docker encendido');
  }

  // 2) Supabase local
  if (C.contenedorEncendido(C.CONT_DB) && (await responde('http://127.0.0.1:54321/rest/v1/'))) paso('La base de datos ya estaba encendida');
  else {
    paso('Encendiendo la base de datos (Supabase, 1–2 minutos)…');
    const s = supabaseCli(`start -x ${EXCLUIDOS}`, 600);
    if (s.status !== 0) throw new Error(`Supabase no arrancó: ${((s.stderr || '') + (s.stdout || '')).trim().split(/\r?\n/).slice(-3).join(' ')}`);
    if (!(await hasta(() => responde('http://127.0.0.1:54321/rest/v1/'), 120))) throw new Error('la base de datos no responde');
    paso('   ✓ Base de datos encendida');
  }

  // 3) postgres-meta (lo usan los scripts; la app no lo necesita)
  if (C.contenedorEncendido(CONT_META)) paso('postgres-meta ya estaba encendido');
  else {
    const m = C.docker(['start', CONT_META]);
    if (m.codigo !== 0) paso(`   · postgres-meta no arrancó (solo lo usan los scripts): ${m.error.trim()}`);
    else paso('   ✓ postgres-meta encendido');
  }

  // 4) La app
  if (await puertoAbierto(PUERTO_APP)) paso('La app ya estaba encendida');
  else {
    const motivo = hayQueCompilar();
    if (motivo) {
      paso(`Preparando la app: ${motivo} (2–4 minutos, solo esta vez)…`);
      compila();
      paso('   ✓ App preparada');
    }
    paso('Encendiendo la app…');
    arrancaApp();
    if (!(await hasta(() => responde(URL_APP), 90))) throw new Error(`la app no responde en ${URL_APP}. Detalle en ${LOG_APP}`);
    paso('   ✓ App encendida');
  }

  if (conNavegador) { abreNavegador(); paso(`Abriendo ${URL_APP} en el navegador`); }
}

// El proceso que escucha en el 3000, solo si es el next de este proyecto.
function procesoApp() {
  const ps = `$c = Get-NetTCPConnection -LocalPort ${PUERTO_APP} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; "$($p.ProcessId)|$($p.CommandLine)" }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, encoding: 'utf8' });
  const l = (r.stdout || '').trim();
  if (!l) return null;
  const [pid, ...resto] = l.split('|');
  return { pid: Number(pid), cmd: resto.join('|') };
}

async function parar() {
  // 1) Copia diaria antes de apagar (si aún no hay de hoy).
  if (dockerVivo() && C.contenedorEncendido(C.CONT_DB) && !C.copiasCompletas(C.DIARIAS).includes(C.hoyLocal())) {
    paso('Haciendo la copia de hoy antes de apagar…');
    const r = spawnSync(process.execPath, [path.join(C.REPO, 'scripts', 'copias', 'copiaDiaria.js')], { windowsHide: true, encoding: 'utf8' });
    paso(r.status === 0 ? '   ✓ Copia hecha' : `   ✗ La copia falló (se sigue apagando): ${(r.stdout + r.stderr).trim()}`);
  }

  // 2) La app
  const p = procesoApp();
  if (!p) paso('La app ya estaba apagada');
  else if (!/next/i.test(p.cmd) || !p.cmd.toLowerCase().includes(path.basename(C.REPO).toLowerCase())) {
    paso(`   · En el puerto ${PUERTO_APP} hay otro programa que no es la app: no lo toco`);
  } else {
    paso('Apagando la app…');
    spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
    await hasta(async () => !(await puertoAbierto(PUERTO_APP)), 15, 500);
    paso('   ✓ App apagada');
  }

  if (!dockerVivo()) { paso('Docker ya estaba apagado'); return; }

  // 3) postgres-meta (va antes de supabase stop, §129)
  if (C.contenedorEncendido(CONT_META)) { C.docker(['stop', CONT_META]); paso('   ✓ postgres-meta apagado'); }

  // 4) Supabase (los datos se quedan en los volúmenes de Docker)
  if (C.contenedorEncendido(C.CONT_DB)) {
    paso('Apagando la base de datos (tus datos se quedan guardados)…');
    const s = supabaseCli('stop', 300);
    if (s.status !== 0) throw new Error(`Supabase no se paró: ${((s.stderr || '') + (s.stdout || '')).trim().split(/\r?\n/).slice(-3).join(' ')}`);
    paso('   ✓ Base de datos apagada');
  } else paso('La base de datos ya estaba apagada');

  // 5) Docker Desktop (libera la memoria de WSL)
  paso('Apagando Docker…');
  C.docker(['desktop', 'stop']);
  await hasta(async () => !dockerVivo(), 60, 2000);
  paso(dockerVivo() ? '   · Docker sigue encendido (no pasa nada)' : '   ✓ Docker apagado');
}

async function main() {
  const orden = process.argv[2];
  try {
    if (orden === 'estado') { console.log(JSON.stringify(await estado())); return 0; }
    if (orden === 'arrancar') {
      await arrancar(!process.argv.includes('--sin-navegador'));
      console.log(`OK: Trading Simulator está encendido en ${URL_APP}`);
      return 0;
    }
    if (orden === 'parar') {
      await parar();
      console.log('OK: Todo apagado. Tus datos se quedan guardados.');
      return 0;
    }
    console.error('Uso: node scripts/lanzador/lanzador.js arrancar [--sin-navegador] | parar | estado');
    return 2;
  } catch (e) {
    console.log('FALLO: ' + e.message);
    return 1;
  }
}

main().then((c) => { process.exitCode = c; });
