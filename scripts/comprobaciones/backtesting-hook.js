// scripts/comprobaciones/backtesting-hook.js — el estado y los cálculos de «La cartera por dentro» (components/backtesting/
// useCarteraPorDentro.js) y lo compartido (components/backtesting/comun.js) se sacaron de pages/index.js TAL CUAL (fase 4 de «el plan
// con lista», docs/builder.md §82). Esta comprobación lo demuestra frente a la versión anterior (VIEJO, la copia de comunes.sh):
//   1) Vuelve a meter el cuerpo del hook en Home, en el sitio de la llamada, y quita la desestructuración: el Home resultante debe ser el
//      de antes con esas mismas sentencias llevadas, en el mismo orden, al sitio de la llamada. Compara el código compacto y sin
//      comentarios (Babel), sentencia a sentencia.
//   2) En ese traslado no puede saltar ningún efecto (useEffect / useLayoutEffect) ni ninguna lectura en el render: ninguna sentencia que
//      se quede en Home entre el sitio viejo y el nuevo puede ser un efecto ni leer en el render un nombre del hook.
//   3) El resto de pages/index.js, idéntico; lo que está en comun.js, idéntico a lo que había en pages/index.js (con «export» delante).
//   4) Ningún nombre sin declarar nuevo en pages/index.js, useCarteraPorDentro.js ni comun.js.
// Si la versión anterior ya tiene el hook, se mete igual en las dos y se comparan (y el traslado no mueve nada).
// Uso: VIEJO=<carpeta> node scripts/comprobaciones/backtesting-hook.js      Termina en 0 si todo es idéntico.
const fs = require('fs'), path = require('path')
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const RAIZ = path.resolve(__dirname, '..', '..'), VIEJO = path.resolve(process.env.VIEJO)
const B = path.join(RAIZ, 'node_modules/next/dist/compiled/babel')
const parser = require(path.join(B, 'parser.js')), tr = require(path.join(B, 'traverse.js')), traverse = tr.default || tr
const gn = require(path.join(B, 'generator.js')), gen = gn.default || gn, t = require(path.join(B, 'types.js'))
const lee = (raiz, f) => { const p = path.join(raiz, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null }
const parsea = (s) => parser.parse(s, { sourceType: 'module', plugins: ['jsx'] })
const cod = (n) => gen(n, { compact: true, comments: false }).code
const declsOf = (n) => { const d = []; if (n.type === 'VariableDeclaration') n.declarations.forEach(x => d.push(...Object.keys(t.getBindingIdentifiers(x.id)))); if (n.type === 'FunctionDeclaration' && n.id) d.push(n.id.name); if (n.type === 'ExportNamedDeclaration' && n.declaration) d.push(...declsOf(n.declaration)); return d }
const esEfecto = (n) => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && /^use(Layout)?Effect$/.test(n.expression.callee.name || '')
const fallos = []
const falla = (m) => { fallos.push(m); console.log('FALLO', m) }

// Cuerpo del hook (sin el return) y sus parámetros.
function hookDe(raiz) {
  const s = lee(raiz, 'components/backtesting/useCarteraPorDentro.js'); if (!s) return null
  const ast = parsea(s); let f
  traverse(ast, { FunctionDeclaration(p) { if (p.node.id && p.node.id.name === 'useCarteraPorDentro') { f = p.node; p.stop() } } })
  const cuerpo = f.body.body.slice(0, -1), ret = f.body.body[f.body.body.length - 1]
  if (ret.type !== 'ReturnStatement') throw new Error('el hook no acaba en return')
  const devuelve = ret.argument.properties.map(p => p.key.name)
  const params = f.params[0].properties.map(p => p.key.name)
  // Devuelve justo lo que declara, ni más ni menos, y cada parámetro sin renombrar.
  const declara = cuerpo.flatMap(declsOf)
  if (devuelve.join() !== declara.join()) falla('el hook no devuelve exactamente lo que declara, en orden')
  ret.argument.properties.forEach(p => { if (!p.shorthand) falla('return con propiedad renombrada: ' + p.key.name) })
  f.params[0].properties.forEach(p => { if (!p.shorthand) falla('parámetro renombrado: ' + p.key.name) })
  return { cuerpo, devuelve, params }
}
// Home con el hook ya metido: la lista de sentencias y en qué índice empieza lo del hook (o -1).
function homeDe(raiz) {
  const ast = parsea(lee(raiz, 'pages/index.js')); let home
  traverse(ast, { FunctionDeclaration(p) { if (p.node.id && p.node.id.name === 'Home') { home = p; p.stop() } } })
  const hook = hookDe(raiz), lista = home.node.body.body
  const k = lista.findIndex(n => n.type === 'VariableDeclaration' && n.declarations[0].init?.type === 'CallExpression' && n.declarations[0].init.callee.name === 'useCarteraPorDentro')
  if (!hook || k < 0) { if (hook) falla('hay hook pero Home no lo llama'); return { ast, home, lista, ini: -1, hook: null } }
  const llamada = lista[k].declarations[0]
  if (llamada.id.properties.map(p => p.key.name).join() !== hook.devuelve.join()) falla('la desestructuración de Home no coincide con lo que devuelve el hook')
  llamada.id.properties.forEach(p => { if (!p.shorthand) falla('desestructuración renombrada: ' + p.key.name) })
  const args = llamada.init.arguments[0].properties
  if (args.map(p => p.key.name).join() !== hook.params.join()) falla('Home no pasa al hook los mismos parámetros que espera')
  args.forEach(p => { if (!p.shorthand) falla('argumento renombrado: ' + p.key.name) })
  return { ast, home, lista: [...lista.slice(0, k), ...hook.cuerpo, ...lista.slice(k + 1)], ini: k, hook }
}
const viejo = homeDe(VIEJO), nuevo = homeDe(RAIZ)
if (!nuevo.hook) { console.error('El árbol de trabajo no tiene useCarteraPorDentro'); process.exit(1) }
// 1) El traslado: en lo viejo, las sentencias del hook (por su código) se llevan al sitio de la llamada.
const cHook = nuevo.hook.cuerpo.map(cod), cViejo = viejo.lista.map(cod), cNuevo = nuevo.lista.map(cod)
const pos = cHook.map(c => { const i = cViejo.indexOf(c); if (i < 0 || cViejo.indexOf(c, i + 1) >= 0) falla('sentencia del hook sin un sitio único en lo viejo: ' + c.slice(0, 80)); return i })
for (let j = 1; j < pos.length; j++) if (pos[j] <= pos[j - 1]) falla('el hook cambia el orden de sus sentencias (' + cHook[j].slice(0, 60) + ')')
const enHook = new Set(pos)
const resto = cViejo.filter((_, i) => !enHook.has(i))
const reordenado = [...resto.slice(0, nuevo.ini), ...cHook, ...resto.slice(nuevo.ini)]
if (reordenado.length !== cNuevo.length) falla(`Home tiene ${cNuevo.length} sentencias y lo viejo trasladado ${reordenado.length}`)
reordenado.forEach((c, i) => { if (c !== cNuevo[i]) falla('Home distinto en la sentencia ' + i + ':\n antes: ' + String(c).slice(0, 160) + '\n ahora: ' + String(cNuevo[i]).slice(0, 160)) })
// 2) Lo que salta el traslado: las sentencias de Home entre la primera del hook en lo viejo y el sitio nuevo.
const nombresHook = new Set(nuevo.hook.devuelve)
const iniViejo = Math.min(...pos), finViejo = viejo.lista.length
let saltados = 0, efectosSaltados = 0
const posEfectos = pos.filter((p, j) => esEfecto(nuevo.hook.cuerpo[j]))
const restoNodos = viejo.lista.filter((_, i) => !enHook.has(i))
const idxResto = viejo.lista.map((_, i) => i).filter(i => !enHook.has(i))
idxResto.forEach((iv, r) => {
  // ¿Esta sentencia que se queda cambia de lado respecto a alguna del hook? Antes había alguna del hook después; ahora todas van en nuevo.ini.
  // Cambia de lado si antes iba detrás de alguna sentencia del hook y ahora va delante de todas, o al revés.
  const ahoraAntes = r < nuevo.ini, cambia = (ps) => ps.some(p => ahoraAntes ? p < iv : p > iv)
  if (cambia(pos)) saltados++
  // Un efecto solo importa frente a los EFECTOS del hook: React los ejecuta en el orden en que se declaran.
  const n = viejo.lista[iv]
  if (esEfecto(n) && cambia(posEfectos)) { efectosSaltados++; falla('un efecto cambia de orden respecto a los del hook: línea ' + n.loc.start.line) }
})
// Lecturas en el render, antes de la llamada, de nombres del hook (los cierres que se ejecutan después sí pueden).
const INMEDIATOS = new Set(['useMemo', 'useState', 'useRef', 'useReducer'])
const enRender = (p, fnHome) => { let f = p.getFunctionParent(); while (f) { if (f.node === fnHome) return true; const par = f.parentPath
  if (par.isCallExpression() && par.node.callee === f.node) { f = par.getFunctionParent(); continue }
  if (par.isCallExpression() && INMEDIATOS.has(par.node.callee.name) && par.node.arguments[0] === f.node) { f = par.getFunctionParent(); continue }
  return false } return true }
const hsN = nuevo.home.get('body').scope
nuevo.home.get('body.body').forEach((s, i) => {
  if (i >= nuevo.ini) return
  s.traverse({ Identifier(p) { if (!nombresHook.has(p.node.name)) return; const b = p.scope.getBinding(p.node.name); if (!b || b.scope !== hsN) return
    if (enRender(p, nuevo.home.node)) falla(`línea ${p.node.loc.start.line}: lee ${p.node.name} en el render antes de la llamada al hook`) } })
})
// 3) El resto del módulo.
const comun = lee(RAIZ, 'components/backtesting/comun.js')
const cComun = parsea(comun).program.body.filter(n => n.type === 'ExportNamedDeclaration' || (n.type !== 'ImportDeclaration')).map(n => cod(n.type === 'ExportNamedDeclaration' ? n.declaration : n))
const modulo = (x, quitaComun) => x.ast.program.body.filter(n => n.type !== 'ImportDeclaration').map(n => (n === x.home.node || n.declaration === x.home.node) ? '<Home>' : cod(n)).filter(c => !(quitaComun && cComun.includes(c)))
const comunViejo = lee(VIEJO, 'components/backtesting/comun.js')
const mV = modulo(viejo, !comunViejo), mN = modulo(nuevo, false)
if (!comunViejo) { const todo = viejo.ast.program.body.map(cod); cComun.forEach(c => { if (!todo.includes(c)) falla('comun.js tiene algo que no estaba en pages/index.js: ' + c.slice(0, 80)) }) }
else if (parsea(comunViejo).program.body.filter(n => n.type !== 'ImportDeclaration').map(n => cod(n.type === 'ExportNamedDeclaration' ? n.declaration : n)).join('\n') !== cComun.join('\n')) falla('comun.js distinto del de la versión anterior')
if (mV.join('\n') !== mN.join('\n')) { let k = 0; while (mV[k] === mN[k]) k++; falla(`el resto de pages/index.js no es idéntico (sentencia ${k} de ${mV.length} / ${mN.length}):\n antes: ${String(mV[k]).slice(0, 160)}\n ahora: ${String(mN[k]).slice(0, 160)}`) }
// 4) Nombres sin declarar.
const libres = (s) => { const out = new Set(); traverse(parsea(s), { Identifier(p) { if (p.isReferencedIdentifier() && !p.scope.getBinding(p.node.name)) out.add(p.node.name) }, JSXIdentifier(p) { if (/^[A-Z]/.test(p.node.name) && p.parentPath.isJSXOpeningElement() && !p.scope.getBinding(p.node.name)) out.add(p.node.name) } }); return out }
const libresViejo = new Set([...libres(lee(VIEJO, 'pages/index.js'))])
for (const f of ['pages/index.js', 'components/backtesting/useCarteraPorDentro.js', 'components/backtesting/comun.js'])
  for (const n of libres(lee(RAIZ, f))) if (!libresViejo.has(n)) falla(`${f}: «${n}» sin declarar`)
console.log(`backtesting-hook: ${nuevo.hook.cuerpo.length} sentencias en el hook (${nuevo.hook.devuelve.length} nombres, ${nuevo.hook.params.length} entradas), ${cComun.length} en comun.js; ${saltados} sentencias de Home cambian de lado (${efectosSaltados} efectos): ${fallos.length ? fallos.length + ' FALLOS' : 'todo idéntico'}`)
process.exit(fallos.length ? 1 : 0)
