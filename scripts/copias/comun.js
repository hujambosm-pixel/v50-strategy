// scripts/copias/comun.js
//
// Piezas comunes de las COPIAS DE SEGURIDAD de la base local (docs/builder.md §130).
//
// Desde el 12/11 la base de la app es Supabase LOCAL (Docker en este PC, §129): ya no hay nadie en la
// nube que la guarde. GitHub solo tiene el código. Estas copias son lo único que protege los datos.
//
// Sin secretos ni rutas con el nombre del usuario: todo sale de la carpeta personal (os.homedir()).
// ESTE REPOSITORIO ES PÚBLICO.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const CASA = os.homedir();
// Carpeta de las copias: Documentos\TradingSimulator_copias (fuera del repo y fuera de OneDrive).
const RAIZ_COPIAS = process.env.COPIAS_RAIZ || path.join(CASA, 'Documents', 'TradingSimulator_copias');
const DIARIAS = path.join(RAIZ_COPIAS, 'diarias');
// Configuración de Supabase local (fuera del repo, §129).
const SUPABASE_LOCAL = path.join(CASA, 'TradingSimulator_local', 'supabase');

const CONT_DB = 'supabase_db_TradingSimulator_local';
const CONT_STORAGE = 'supabase_storage_TradingSimulator_local';
const GUARDAR_DIARIAS = 14;

// docker.exe: la tarea programada no siempre hereda el PATH de Docker Desktop.
function rutaDocker() {
  const fija = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
  return fs.existsSync(fija) ? fija : 'docker';
}

// Docker sin pasar por una consola: argumentos tal cual, salida en Buffer.
function docker(args, opciones = {}) {
  const r = spawnSync(rutaDocker(), args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opciones });
  return {
    codigo: r.status,
    salida: r.stdout ? r.stdout.toString('utf8') : '',
    error: (r.stderr ? r.stderr.toString('utf8') : '') + (r.error ? String(r.error) : ''),
  };
}

function contenedorEncendido(nombre) {
  const r = docker(['inspect', '--format', '{{.State.Running}}', nombre]);
  return r.codigo === 0 && r.salida.trim() === 'true';
}

// Fecha local AAAA-MM-DD (la copia «de hoy» es la del día del PC, no la de Greenwich).
function hoyLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Copias completas de una carpeta, de la más nueva a la más vieja. Solo cuentan las que tienen
// manifiesto: una copia a medias (carpeta «.enCurso») nunca cuenta como copia.
function copiasCompletas(carpeta) {
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta)
    .filter((n) => ES_FECHA.test(n) && fs.existsSync(path.join(carpeta, n, 'manifiesto.json')))
    .sort()
    .reverse();
}

function sha256Archivo(ruta) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(ruta).on('data', (b) => h.update(b)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Todos los archivos de una carpeta, con ruta relativa (con «/»), tamaño y sha256.
async function inventario(carpeta) {
  const lista = [];
  const recorre = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorre(ruta);
      else if (e.isFile()) lista.push(ruta);
    }
  };
  recorre(carpeta);
  const out = [];
  for (const ruta of lista.sort()) {
    const rel = path.relative(carpeta, ruta).split(path.sep).join('/');
    if (rel === 'manifiesto.json') continue;
    out.push({ archivo: rel, bytes: fs.statSync(ruta).size, sha256: await sha256Archivo(ruta) });
  }
  return out;
}

// Registro de una línea por intento (para saber qué pasó sin abrir nada). Se quedan las 500 últimas.
function anotaRegistro(carpeta, linea) {
  try {
    fs.mkdirSync(carpeta, { recursive: true });
    const ruta = path.join(carpeta, '_registro.txt');
    const previas = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8').split(/\r?\n/).filter(Boolean) : [];
    previas.push(`${new Date().toISOString()}  ${linea}`);
    fs.writeFileSync(ruta, previas.slice(-500).join('\r\n') + '\r\n');
  } catch (_) { /* el registro nunca debe tumbar la copia */ }
}

module.exports = {
  REPO, RAIZ_COPIAS, DIARIAS, SUPABASE_LOCAL, CONT_DB, CONT_STORAGE, GUARDAR_DIARIAS,
  rutaDocker, docker, contenedorEncendido, hoyLocal, ES_FECHA, copiasCompletas,
  sha256Archivo, inventario, anotaRegistro, spawn,
};
