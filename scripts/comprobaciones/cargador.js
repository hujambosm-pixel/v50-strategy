// scripts/comprobaciones/cargador.js — carga módulos ESM del proyecto con el SWC de Next (CommonJS). Cada raíz registrada es un
// árbol de código distinto (la copia de la versión anterior y el árbol de trabajo), y Node los cachea por ruta, así que no se
// mezclan. Solo lo usan las comprobaciones comunes (docs/builder.md, §22).
const Module = require('module'), fs = require('fs'), path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const swc = require(path.join(RAIZ, 'node_modules', 'next', 'dist', 'build', 'swc'))
let listo = false
async function prepara() { if (!listo) { await swc.loadBindings(); listo = true } }
const RAICES = []
function registra(raiz) { RAICES.push(path.resolve(raiz).toLowerCase()) }
const orig = Module._extensions['.js']
Module._extensions['.js'] = function (mod, filename) {
  const f = path.resolve(filename).toLowerCase()
  if (RAICES.some(r => f.startsWith(r + path.sep)) && !f.includes(path.sep + 'node_modules' + path.sep)) {
    const src = fs.readFileSync(filename, 'utf8')
    const out = swc.transformSync(src, { filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020',
      transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } })
    return mod._compile(out.code, filename)
  }
  return orig(mod, filename)
}
module.exports = { prepara, registra, swc, RAIZ }
