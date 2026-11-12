// scripts/copias/copiaUsb.js
//
// COPIA AL USB, cada 15 días (docs/builder.md §131). La usa la ventana avisoUsb.ps1; también se puede
// lanzar a mano:
//
//   node scripts/copias/copiaUsb.js estado        ¿toca copiar? (una línea JSON)
//   node scripts/copias/copiaUsb.js unidades      unidades USB conectadas (una línea JSON)
//   node scripts/copias/copiaUsb.js marcar E:\    marca esa unidad como «el USB de las copias»
//   node scripts/copias/copiaUsb.js copiar        pasa la última copia diaria al USB marcado y la comprueba
//   node scripts/copias/copiaUsb.js recordar      no vuelve a avisar hasta mañana
//
// Por qué marcar el USB: para no copiar nunca en un disco equivocado (otro pendrive, una cámara…).
// La primera vez se elige la unidad y se deja en su raíz el archivo TradingSimulator_USB_COPIAS.json
// con un identificador; el mismo identificador queda en Documentos\TradingSimulator_copias\_usb.json.
// Solo se copia en una unidad cuyo archivo de marca tenga ESE identificador.
//
// En el USB, carpeta TradingSimulator_copias\:
//   AAAA-MM-DD\            copia diaria tal cual (las 6 últimas), comprobada archivo a archivo con el
//                          sha256 de su manifiesto
//   codigo\repo.bundle     el repositorio entero con su historial (git bundle; solo se rehace si hay
//                          commits nuevos): con él y el USB se reconstruye todo aunque falle GitHub
//   LEEME_RESTAURAR.txt    cómo montarlo todo en un PC nuevo
//   _registro.txt          una línea por copia
//
// Prueba sin USB: COPIAS_USB_PRUEBA=<carpeta> hace que esa carpeta salga como una unidad USB más.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const C = require('./comun');

const DIAS_ENTRE_COPIAS = 15;
const GUARDAR_EN_USB = 6;
const MARCA = 'TradingSimulator_USB_COPIAS.json';
const CARPETA_USB = 'TradingSimulator_copias';
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

// Unidades USB conectadas: { raiz: 'E:\\', nombre, bytes, libres, marcada }
function unidades() {
  const ps = `Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object {
  $d = Get-Disk -Number $_.DiskNumber
  if ($d.BusType -eq 'USB') {
    $v = Get-Volume -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue
    if ($v -and $v.Size -gt 0) { '{0}|{1}|{2}|{3}|{4}' -f $_.DriveLetter, $v.FileSystemLabel, $v.Size, $v.SizeRemaining, $d.FriendlyName }
  }
}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, encoding: 'utf8' });
  const lista = (r.stdout || '').split(/\r?\n/).filter(Boolean).map((l) => {
    const [letra, etiqueta, bytes, libres, aparato] = l.split('|');
    return { raiz: `${letra}:\\`, nombre: etiqueta || aparato || 'USB', bytes: Number(bytes), libres: Number(libres) };
  });
  if (process.env.COPIAS_USB_PRUEBA) {
    const p = path.resolve(process.env.COPIAS_USB_PRUEBA);
    fs.mkdirSync(p, { recursive: true });
    const s = fs.statfsSync(p);
    lista.push({ raiz: p, nombre: 'USB de prueba', bytes: s.blocks * s.bsize, libres: s.bavail * s.bsize });
  }
  const id = leeEstado().id;
  for (const u of lista) u.marcada = !!id && leeMarca(u.raiz) === id;
  return lista;
}

function leeMarca(raiz) {
  try { return JSON.parse(fs.readFileSync(path.join(raiz, MARCA), 'utf8')).id || null; } catch (_) { return null; }
}

function marcar(raiz) {
  if (!raiz) throw new Error('falta la unidad');
  const u = unidades().find((x) => path.resolve(x.raiz) === path.resolve(raiz));
  if (!u) throw new Error(`${raiz} no es una unidad USB conectada`);
  const e = leeEstado();
  if (!e.id) e.id = crypto.randomUUID();
  fs.writeFileSync(path.join(u.raiz, MARCA), JSON.stringify({
    id: e.id,
    marcado: new Date().toISOString(),
    nota: 'Este disco guarda las copias de seguridad de Trading Simulator. No borres este archivo.',
  }, null, 2));
  e.usbNombre = u.nombre;
  guardaEstado(e);
  return u;
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
    usbElegido: !!e.id,
    usbNombre: e.usbNombre || null,
  };
}

function recordar() {
  const e = leeEstado();
  e.recordarDesde = manana();
  guardaEstado(e);
  return e.recordarDesde;
}

function paso(t) { console.log('PASO: ' + t); }

function copiaComprobada(origen, destino, archivos) {
  for (const a of archivos) {
    const de = path.join(origen, ...a.archivo.split('/'));
    const a2 = path.join(destino, ...a.archivo.split('/'));
    fs.mkdirSync(path.dirname(a2), { recursive: true });
    fs.copyFileSync(de, a2);
  }
  fs.copyFileSync(path.join(origen, 'manifiesto.json'), path.join(destino, 'manifiesto.json'));
}

async function verifica(carpeta, archivos) {
  for (const a of archivos) {
    const ruta = path.join(carpeta, ...a.archivo.split('/'));
    if (!fs.existsSync(ruta)) throw new Error(`falta ${a.archivo} en el USB`);
    if (fs.statSync(ruta).size !== a.bytes) throw new Error(`${a.archivo} no tiene el tamaño esperado en el USB`);
    if ((await C.sha256Archivo(ruta)) !== a.sha256) throw new Error(`${a.archivo} no coincide con su huella en el USB`);
  }
}

function git(args, opciones = {}) {
  const r = spawnSync('git', ['-C', C.REPO, ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opciones });
  return { codigo: r.status, salida: (r.stdout || '').trim(), error: (r.stderr || '').trim() + (r.error ? String(r.error) : '') };
}

// El repositorio entero (todas las ramas y etiquetas) en un solo archivo. Solo si cambió.
function copiaCodigo(destUsb) {
  const carpeta = path.join(destUsb, 'codigo');
  fs.mkdirSync(carpeta, { recursive: true });
  const cabeza = git(['rev-parse', 'HEAD']).salida;
  const anotado = path.join(carpeta, 'commit.txt');
  const bundle = path.join(carpeta, 'repo.bundle');
  if (fs.existsSync(bundle) && fs.existsSync(anotado) && fs.readFileSync(anotado, 'utf8').split(/\r?\n/)[0] === cabeza) {
    paso('El código del USB ya está al día');
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

function anotaUsb(destUsb, linea) { C.anotaRegistro(destUsb, linea); }

async function copiar() {
  const e = leeEstado();
  if (!e.id) throw new Error('Aún no has elegido el USB de las copias');
  const u = unidades().find((x) => x.marcada);
  if (!u) throw new Error(`No encuentro tu USB de copias${e.usbNombre ? ` («${e.usbNombre}»)` : ''}. Conéctalo y vuelve a pulsar «Copiar».`);
  const ultima = C.copiasCompletas(C.DIARIAS)[0];
  if (!ultima) throw new Error('No hay ninguna copia diaria en el PC todavía');

  const origen = path.join(C.DIARIAS, ultima);
  const manifiesto = JSON.parse(fs.readFileSync(path.join(origen, 'manifiesto.json'), 'utf8'));
  const destUsb = path.join(u.raiz, CARPETA_USB);
  fs.mkdirSync(destUsb, { recursive: true });

  // Sitio libre: la copia + el código (si hay que rehacerlo) + margen.
  const bytesCopia = manifiesto.archivos.reduce((a, b) => a + b.bytes, 0);
  const s = fs.statfsSync(destUsb);
  const libres = s.bavail * s.bsize;
  if (libres < bytesCopia + 600 * 1048576) {
    throw new Error(`En el USB quedan ${(libres / 1048576).toFixed(0)} MB libres y hacen falta unos ${((bytesCopia / 1048576) + 600).toFixed(0)} MB`);
  }

  // 1) Comprobar la copia del PC antes de pasarla (no se pasa al USB una copia estropeada).
  paso(`Comprobando la copia del ${fb(ultima)} en el PC…`);
  await verifica(origen, manifiesto.archivos);

  // 2) Pasarla al USB y comprobarla allí, archivo a archivo.
  const final = path.join(destUsb, ultima);
  const yaEstaba = fs.existsSync(path.join(final, 'manifiesto.json'));
  if (yaEstaba) {
    paso('Esa copia ya estaba en el USB: la compruebo…');
    await verifica(final, manifiesto.archivos);
  } else {
    paso(`Copiando al USB (${(bytesCopia / 1048576).toFixed(0)} MB)…`);
    const enCurso = final + '.enCurso';
    fs.rmSync(enCurso, { recursive: true, force: true });
    copiaComprobada(origen, enCurso, manifiesto.archivos);
    paso('Comprobando que ha llegado entera…');
    await verifica(enCurso, manifiesto.archivos);
    fs.renameSync(enCurso, final);
  }

  // 3) El código y la guía.
  const cod = copiaCodigo(destUsb);
  fs.copyFileSync(path.join(__dirname, 'LEEME_RESTAURAR.txt'), path.join(destUsb, 'LEEME_RESTAURAR.txt'));

  // 4) Se quedan las 6 últimas; fuera restos a medias.
  const enUsb = C.copiasCompletas(destUsb);
  for (const vieja of enUsb.slice(GUARDAR_EN_USB)) fs.rmSync(path.join(destUsb, vieja), { recursive: true, force: true });
  for (const n of fs.readdirSync(destUsb)) if (n.endsWith('.enCurso')) fs.rmSync(path.join(destUsb, n), { recursive: true, force: true });

  const quedan = C.copiasCompletas(destUsb);
  const txt = `OK ${C.hoyLocal()}: copia del ${ultima} en el USB (${(bytesCopia / 1048576).toFixed(0)} MB, comprobada); código ${cod.cabeza.slice(0, 8)}${cod.rehecho ? ' (rehecho)' : ''}; en el USB hay ${quedan.length} copias`;
  anotaUsb(destUsb, txt);
  C.anotaRegistro(C.RAIZ_COPIAS, 'USB ' + txt);

  const e2 = leeEstado();
  e2.ultimaCopiaUsb = C.hoyLocal();
  e2.ultimaCopiaUsbDe = ultima;
  delete e2.recordarDesde;
  guardaEstado(e2);
  return { ultima, quedan, libresMb: Math.round(fs.statfsSync(destUsb).bavail * fs.statfsSync(destUsb).bsize / 1048576), txt };
}

async function main() {
  const [orden, arg] = process.argv.slice(2);
  try {
    if (orden === 'estado') console.log(JSON.stringify(estado()));
    else if (orden === 'unidades') console.log(JSON.stringify(unidades()));
    else if (orden === 'marcar') { const u = marcar(arg); console.log(`OK: ${u.raiz} (${u.nombre}) es ahora tu USB de copias`); }
    else if (orden === 'recordar') console.log(`OK: te lo recordaré el ${fb(recordar())}`);
    else if (orden === 'copiar') {
      const r = await copiar();
      const cuantas = r.quedan.length === 1 ? 'Hay 1 copia en el USB'
        : `Hay ${r.quedan.length} copias en el USB (la más vieja, del ${fb(r.quedan[r.quedan.length - 1])})`;
      console.log(`OK: Copia del ${fb(r.ultima)} guardada y comprobada en el USB. ${cuantas}; quedan ${r.libresMb} MB libres. Ya puedes desconectarlo.`);
    } else {
      console.error('Uso: node scripts/copias/copiaUsb.js estado | unidades | marcar <unidad> | copiar | recordar');
      return 2;
    }
    return 0;
  } catch (err) {
    if (orden === 'copiar') C.anotaRegistro(C.RAIZ_COPIAS, `USB FALLO ${C.hoyLocal()}: ${err.message}`);
    console.log('FALLO: ' + err.message);
    return 1;
  }
}

main().then((c) => { process.exitCode = c; });
