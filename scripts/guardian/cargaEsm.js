// scripts/guardian/cargaEsm.js — carga los módulos ESM del proyecto (pages/api, lib, components) desde
// Node, compilándolos con el SWC de Next: el MISMO compilador que usa `npm run build`. Así el guardián
// ejecuta el motor real, no una copia. Solo lo usan los scripts; la aplicación no pasa por aquí.
const Module = require('module')
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..', '..')
const SCRIPTS = path.join(RAIZ, 'scripts') + path.sep
const MODULOS = path.sep + 'node_modules' + path.sep
let listo = false

async function preparaEsm() {
  if (listo) return
  const swc = require(path.join(RAIZ, 'node_modules', 'next', 'dist', 'build', 'swc'))
  await swc.loadBindings()
  const original = Module._extensions['.js']
  Module._extensions['.js'] = function (mod, fichero) {
    const f = path.resolve(fichero)
    if (f.startsWith(RAIZ + path.sep) && !f.includes(MODULOS) && !f.startsWith(SCRIPTS)) {
      const fuente = fs.readFileSync(fichero, 'utf8')
      const { code } = swc.transformSync(fuente, { filename: fichero,
        jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020', transform: { react: { runtime: 'automatic' } } },
        module: { type: 'commonjs' } })
      return mod._compile(code, fichero)
    }
    return original(mod, fichero)
  }
  // Las hojas de estilo no cuentan fuera del navegador.
  Module._extensions['.css'] = (mod) => { mod.exports = {} }
  listo = true
}

module.exports = { preparaEsm, RAIZ }
