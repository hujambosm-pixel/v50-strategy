// scripts/copias/copiaUsb.js
//
// COPIA AL USB (o a la carpeta que elijas), cada 15 días (docs/builder.md §131 y §132). La usa la
// ventana avisoUsb.ps1; también se puede lanzar a mano:
//
//   node scripts/copias/copiaUsb.js estado              ¿toca copiar? (una línea JSON)
//   node scripts/copias/copiaUsb.js unidades            unidades USB conectadas (una línea JSON)
//   node scripts/copias/copiaUsb.js revisa <carpeta>    dónde iría y qué hay que avisar (JSON)
//   node scripts/copias/copiaUsb.js copiar <carpeta>    pasa la última copia diaria allí y la comprueba
//   node scripts/copias/copiaUsb.js recordar            no vuelve a avisar hasta mañana
//
// El destino es LIBRE (decisión de Sergi, 12/11): cualquier USB o carpeta; la ventana propone el último.
// Avisos: una carpeta del MISMO disco físico que el PC no protege si el disco falla, así que no cuenta
// para el aviso de los 15 días; una de OneDrive sube a la nube datos sin cifrar. Prohibido dentro de la
// carpeta de las copias diarias y dentro del repositorio (es público).
//
// En el destino, carpeta TradingSimulator_copias\ (si la carpeta elegida ya se llama así, esa misma):
//   AAAA-MM-DD\            copia diaria tal cual (las 6 últimas), comprobada archivo a archivo con el
//                          sha256 de su manifiesto
//   codigo\repo.bundle     el repositorio entero con su historial (git bundle; solo se rehace si hay
//                          commits nuevos): con él y la copia se reconstruye todo aunque falle GitHub
//   LEEME_RESTAURAR.txt    cómo montarlo todo en un PC nuevo
//   _registro.txt          una línea por copia
//
// Pruebas: COPIAS_USB_PRUEBA=<carpeta> hace que esa carpeta salga como una unidad USB más;
// COPIAS_OTRO_DISCO=1 trata cualquier carpeta como si estuviera en otro disco.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const C = require('./comun');

const DIAS_ENTRE_COPIAS = 15;
const GUARDAR_EN_DESTINO = 6;
const CARPETA_DESTINO = 'TradingSimulator_copias';
const ESTADO = path.join(C.RAIZ_COPIAS, '_usb.json');

function leeEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (_) { return {}; }
}
function guardaEstado(e) {
  fs.mkdirSync(C.RAIZ_COPIAS, { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2));
}

function diasEntre(a, b) { // fechas AAAA-MM-DD
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
function fb(f) { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; } // 2026-11-12 → 12/11/2026
function manana() { const d = new Date(); d.setDate(d.getDate() + 1); return C.hoyLocal(d); }

function powershell(ps) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, encoding: 'utf8' });
  return (r.stdout || '').trim();
}

// Unidades USB conectadas: { raiz: 'E:\\', nombre, bytes, libres }
function unidades() {
  const ps = `Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object {
  $d = Get-Disk -Number $_.DiskNumber
  if ($d.BusType -eq 'USB') {
    $v = Get-Volume -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue
    if ($v -and $v.Size -gt 0) { '{0}|{1}|{2}|{3}|{4}' -f $_.DriveLetter, $v.FileSystemLabel, $v.Size, $v.SizeRemaining, $d.FriendlyName }
  }
}`;
  const lista = powershell(ps).split(/\r?\n/).filter(Boolean).map((l) => {
    const [letra, etiqueta, bytes, libres, aparato] = l.split('|');
    return { raiz: `${letra}:\\`, nombre: etiqueta || aparato || 'USB', bytes: Number(bytes), libres: Number(libres) };
  });
  if (process.env.COPIAS_USB_PRUEBA) {
    const p = path.resolve(process.env.COPIAS_USB_PRUEBA);
    fs.mkdirSync(p, { recursive: true });
    const s = fs.statfsSync(p);
    lista.push({ raiz: p, nombre: 'USB de prueba', bytes: s.blocks * s.bsize, libres: s.bavail * s.bsize });
  }
  return lista;
}

const dentro = (hijo, padre) => {
  const r = path.relative(path.resolve(padre), path.resolve(hijo));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

// Dónde iría la copia y qué hay que avisar.
function revisa(elegida) {
  if (!elegida) throw new Error('Falta elegir el USB o la carpeta');
  const abs = path.resolve(elegida);
  const raizUnidad = path.parse(abs).root;
  if (!fs.existsSync(raizUnidad)) throw new Error(`No encuentro ${raizUnidad}: ¿está conectado?`);
  if (!fs.existsSync(abs)) throw new Error(`No existe la carpeta ${abs}`);
  const destino = path.basename(abs).toLowerCase() === CARPETA_DESTINO.toLowerCase() ? abs : path.join(abs, CARPETA_DESTINO);
  if (dentro(destino, C.RAIZ_COPIAS) || dentro(C.RAIZ_COPIAS, destino)) throw new Error('Esa es la carpeta de las copias diarias del PC: elige otra');
  if (dentro(destino, C.REPO)) throw new Error('Esa carpeta está dentro del proyecto, que se sube a GitHub (público): elige otra');
  // ¿Mismo disco físico que el sistema? (otra partición del mismo disco tampoco protege)
  let mismoDisco = false;
  const letra = /^[A-Za-z]:\\$/.test(raizUnidad) ? raizUnidad[0].toUpperCase() : null;
  if (letra && !process.env.COPIAS_OTRO_DISCO) {
    mismoDisco = powershell(`$s = (Get-Partition -DriveLetter ($env:SystemDrive[0])).DiskNumber; ` +
      `$d = (Get-Partition -DriveLetter '${letra}' -ErrorAction SilentlyContinue).DiskNumber; ` +
      `if ($d -ne $null -and $d -eq $s) { 'SI' } else { 'NO' }`) === 'SI';
  }
  const s = fs.statfsSync(abs);
  return { elegida: abs, destino, mismoDisco, oneDrive: /onedrive/i.test(abs), libres: s.bavail * s.bsize };
}

function estado() {
  const e = leeEstado();
  const hoy = C.hoyLocal();
  const diarias = C.copiasCompletas(C.DIARIAS);
  const dias = e.ultimaCopiaUsb ? diasEntre(e.ultimaCopiaUsb, hoy) : null;
  const vencida = dias === null || dias >= DIAS_ENTRE_COPIAS;
  const pospuesta = !!e.recordarDesde && hoy < e.recordarDesde;
  return {
    toca: diarias.length > 0 && vencida && !pospuesta,
    hoy,
    ultimaDiaria: diarias[0] || null,
    ultimaCopiaUsb: e.ultimaCopiaUsb || null,
    diasDesdeUsb: dias,
    recordarDesde: e.recordarDesde || null,
    ultimoDestino: e.ultimoDestino || null,
  };
}

function recordar() {
  const e = leeEstado();
  e.recordarDesde = manana();
  guardaEstado(e);
  return e.recordarDesde;
}

function paso(t) { console.log('PASO: ' + t); }

function copiaArchivos(origen, destino, archivos) {
  for (const a of archivos) {
    const de = path.join(origen, ...a.archivo.split('/'));
    const a2 = path.join(destino, ...a.archivo.split('/'));
    fs.mkdirSync(path.dirname(a2), { recursive: true });
    fs.copyFileSync(de, a2);
  }
  fs.copyFileSync(path.join(origen, 'manifiesto.json'), path.join(destino, 'manifiesto.json'));
}

async function verifica(carpeta, archivos, donde) {
  for (const a of archivos) {
    const ruta = path.join(carpeta, ...a.archivo.split('/'));
    if (!fs.existsSync(ruta)) throw new Error(`falta ${a.archivo} ${donde}`);
    if (fs.statSync(ruta).size !== a.bytes) throw new Error(`${a.archivo} no tiene el tamaño esperado ${donde}`);
    if ((await C.sha256Archivo(ruta)) !== a.sha256) throw new Error(`${a.archivo} no coincide con su huella ${donde}`);
  }
}

function git(args, opciones = {}) {
  const r = spawnSync('git', ['-C', C.REPO, ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opciones });
  return { codigo: r.status, salida: (r.stdout || '').trim(), error: (r.stderr || '').trim() + (r.error ? String(r.error) : '') };
}

// El repositorio entero (todas las ramas y etiquetas) en un solo archivo. Solo si cambió.
function copiaCodigo(dest) {
  const carpeta = path.join(dest, 'codigo');
  fs.mkdirSync(carpeta, { recursive: true });
  const cabeza = git(['rev-parse', 'HEAD']).salida;
  const anotado = path.join(carpeta, 'commit.txt');
  const bundle = path.join(carpeta, 'repo.bundle');
  if (fs.existsSync(bundle) && fs.existsSync(anotado) && fs.readFileSync(anotado, 'utf8').split(/\r?\n/)[0] === cabeza) {
    paso('El código ya estaba al día');
    return { rehecho: false, cabeza };
  }
  paso('Guardando el código con todo su historial (puede tardar un par de minutos)…');
  const nuevo = bundle + '.nuevo';
  fs.rmSync(nuevo, { force: true });
  // HEAD incluido: sin él, «git clone» del bundle no sabe qué rama sacar y deja la carpeta vacía.
  const b = git(['bundle', 'create', nuevo, 'HEAD', '--branches', '--tags']);
  if (b.codigo !== 0) throw new Error(`git bundle falló: ${b.error}`);
  const v = git(['bundle', 'verify', nuevo]);
  if (v.codigo !== 0) throw new Error(`el código copiado no se puede leer: ${v.error}`);
  fs.rmSync(bundle, { force: true });
  fs.renameSync(nuevo, bundle);
  const ultimo = git(['log', '-1', '--format=%h %ad %s', '--date=short']).salida;
  fs.writeFileSync(anotado, `${cabeza}\r\n${ultimo}\r\n`);
  return { rehecho: true, cabeza };
}

async function copiar(elegida) {
  const r0 = revisa(elegida);
  if (r0.mismoDisco) paso('Ojo: esa carpeta está en el mismo disco que el PC; si el disco falla, se pierde con él. No cuenta para el aviso de los 15 días.');
  if (r0.oneDrive) paso('Ojo: esa carpeta es de OneDrive: la copia (sin cifrar, con claves) se subirá a la nube.');
  const ultima = C.copiasCompletas(C.DIARIAS)[0];
  if (!ultima) throw new Error('No hay ninguna copia diaria en el PC todavía');

  const origen = path.join(C.DIARIAS, ultima);
  const manifiesto = JSON.parse(fs.readFileSync(path.join(origen, 'manifiesto.json'), 'utf8'));
  const dest = r0.destino;
  fs.mkdirSync(dest, { recursive: true });

  // Sitio libre: la copia + el código (si hay que rehacerlo) + margen.
  const bytesCopia = manifiesto.archivos.reduce((a, b) => a + b.bytes, 0);
  const s = fs.statfsSync(dest);
  const libres = s.bavail * s.bsize;
  if (libres < bytesCopia + 600 * 1048576) {
    throw new Error(`Allí quedan ${(libres / 1048576).toFixed(0)} MB libres y hacen falta unos ${((bytesCopia / 1048576) + 600).toFixed(0)} MB`);
  }

  // 1) Comprobar la copia del PC antes de pasarla (no se pasa una copia estropeada).
  paso(`Comprobando la copia del ${fb(ultima)} en el PC…`);
  await verifica(origen, manifiesto.archivos, 'en el PC');

  // 2) Pasarla y comprobarla allí, archivo a archivo.
  const final = path.join(dest, ultima);
  if (fs.existsSync(path.join(final, 'manifiesto.json'))) {
    paso('Esa copia ya estaba allí: la compruebo…');
    await verifica(final, manifiesto.archivos, 'en el destino');
  } else {
    paso(`Copiando en ${dest} (${(bytesCopia / 1048576).toFixed(0)} MB)…`);
    const enCurso = final + '.enCurso';
    fs.rmSync(enCurso, { recursive: true, force: true });
    copiaArchivos(origen, enCurso, manifiesto.archivos);
    paso('Comprobando que ha llegado entera…');
    await verifica(enCurso, manifiesto.archivos, 'en el destino');
    fs.renameSync(enCurso, final);
  }

  // 3) El código y la guía.
  const cod = copiaCodigo(dest);
  fs.copyFileSync(path.join(__dirname, 'LEEME_RESTAURAR.txt'), path.join(dest, 'LEEME_RESTAURAR.txt'));

  // 4) Se quedan las 6 últimas; fuera restos a medias. Solo se borra dentro de TradingSimulator_copias.
  for (const vieja of C.copiasCompletas(dest).slice(GUARDAR_EN_DESTINO)) fs.rmSync(path.join(dest, vieja), { recursive: true, force: true });
  for (const n of fs.readdirSync(dest)) if (n.endsWith('.enCurso')) fs.rmSync(path.join(dest, n), { recursive: true, force: true });

  const quedan = C.copiasCompletas(dest);
  const txt = `OK ${C.hoyLocal()}: copia del ${ultima} en ${dest}${r0.mismoDisco ? ' (mismo disco que el PC)' : ''} (${(bytesCopia / 1048576).toFixed(0)} MB, comprobada); código ${cod.cabeza.slice(0, 8)}${cod.rehecho ? ' (rehecho)' : ''}; allí hay ${quedan.length} copias`;
  C.anotaRegistro(dest, txt);
  C.anotaRegistro(C.RAIZ_COPIAS, 'FUERA ' + txt);

  const e2 = leeEstado();
  e2.ultimoDestino = r0.elegida;
  if (!r0.mismoDisco) {
    e2.ultimaCopiaUsb = C.hoyLocal();
    e2.ultimaCopiaUsbDe = ultima;
    e2.ultimaCopiaUsbEn = dest;
    delete e2.recordarDesde;
  }
  guardaEstado(e2);
  const s2 = fs.statfsSync(dest);
  return { ultima, quedan, dest, mismoDisco: r0.mismoDisco, libresMb: Math.round(s2.bavail * s2.bsize / 1048576) };
}

async function main() {
  const [orden, arg] = process.argv.slice(2);
  try {
    if (orden === 'estado') console.log(JSON.stringify(estado()));
    else if (orden === 'unidades') console.log(JSON.stringify(unidades()));
    else if (orden === 'revisa') console.log(JSON.stringify(revisa(arg)));
    else if (orden === 'recordar') console.log(`OK: te lo recordaré el ${fb(recordar())}`);
    else if (orden === 'copiar') {
      const r = await copiar(arg);
      const cuantas = r.quedan.length === 1 ? 'Allí hay 1 copia'
        : `Allí hay ${r.quedan.length} copias (la más vieja, del ${fb(r.quedan[r.quedan.length - 1])})`;
      console.log(`OK: Copia del ${fb(r.ultima)} guardada y comprobada en ${r.dest}. ${cuantas}; quedan ${r.libresMb} MB libres.${r.mismoDisco ? '' : ' Si es un USB, ya puedes desconectarlo.'}`);
    } else {
      console.error('Uso: node scripts/copias/copiaUsb.js estado | unidades | revisa <carpeta> | copiar <carpeta> | recordar');
      return 2;
    }
    return 0;
  } catch (err) {
    if (orden === 'copiar') C.anotaRegistro(C.RAIZ_COPIAS, `FUERA FALLO ${C.hoyLocal()}: ${err.message}`);
    console.log('FALLO: ' + err.message);
    return 1;
  }
}

main().then((c) => { process.exitCode = c; });
