// scripts/comprobaciones/backtesting-resultados.js — los resultados del Backtesting («La cartera por dentro»,
// components/backtesting/CarteraPorDentro.js; fase 2 de «el plan con lista», docs/builder.md §78): compila con el SWC de Next (como el
// build) lo que pinta la pieza en la versión anterior (VIEJO, la copia de comunes.sh) y en el árbol de trabajo, y exige el MISMO código,
// carácter a carácter (compacto y sin comentarios: la sangría y los comentarios no cuentan). Si la versión anterior aún no tiene la pieza,
// compara con el bloque de pages/index.js de esa versión (el que se sacó). Un cambio querido en esta pantalla hará fallar esta
// comprobación a propósito: se explica en el commit y se acepta aquí, como en backtesting-panel.js.
// Uso: VIEJO=<carpeta> node scripts/comprobaciones/backtesting-resultados.js      Termina en 0 si es idéntico.
const fs = require('fs'), path = require('path')
const { prepara, swc, RAIZ } = require('./cargador')
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const VIEJO = path.resolve(process.env.VIEJO)
const B = path.join(RAIZ, 'node_modules/next/dist/compiled/babel')
const parser = require(path.join(B, 'parser.js')), tr = require(path.join(B, 'traverse.js')), traverse = tr.default || tr
const gn = require(path.join(B, 'generator.js')), gen = gn.default || gn
const compila = (codigo) => swc.transformSync(codigo, { filename: 'x.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020', transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } }).code
const retorno = (js, nombre) => { let r; traverse(parser.parse(js, { sourceType: 'module' }), { FunctionDeclaration(p) { if (p.node.id && p.node.id.name === nombre) { r = p.node.body.body.find(s => s.type === 'ReturnStatement').argument; p.stop() } } }); if (!r) throw new Error('no encuentro ' + nombre); return gen(r, { compact: true, comments: false }).code }
// CAMBIOS QUERIDOS: si la versión anterior aún no los tiene, se aplican a su código antes de comparar (y solo eso puede cambiar).
//   V9.1140 · las barras de «Resultados por operación» con el hueco que se encoge (huecoBarras de lib/utils.js), en sus dos sitios.
const CAMBIOS = [
  { de: '<div className="equity-bars">\n                        {trades.map(', a: '<div className="equity-bars" style={{gap:huecoBarras(trades.length)}}>\n                        {trades.map(' },
  { de: '<div className="equity-bars">\n                {(()=>{\n                  const allT=mcSoloActivoSel(', a: '<div className="equity-bars" style={{gap:huecoBarras(mcSoloActivoSel(mcResult.allTrades||[]).length)}}>\n                {(()=>{\n                  const allT=mcSoloActivoSel(' },
]
const conCambios = (src) => CAMBIOS.reduce((s, c) => {
  if (s.includes(c.a)) return s
  if (s.split(c.de).length !== 2) throw new Error('cambio querido sin su sitio en la versión anterior: ' + c.de.slice(0, 60))
  return s.replace(c.de, () => c.a)
}, src)
function codigoDe(raiz, viejo) {
  const f = path.join(raiz, 'components/backtesting/CarteraPorDentro.js')
  if (fs.existsSync(f)) { const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); return { de: 'la pieza', codigo: retorno(compila(viejo && !src.includes('huecoBarras(') ? conCambios(src) : src), 'CarteraPorDentro') } }
  const L = fs.readFileSync(path.join(raiz, 'pages/index.js'), 'utf8').replace(/\r\n/g, '\n').split('\n')
  const i0 = L.indexOf("            {mcResult&&sidePanel==='multi'&&("); if (i0 < 0) throw new Error('no encuentro el bloque en pages/index.js')
  let i1 = i0 + 1; while (L[i1] !== '            )}') i1++
  return { de: 'el bloque de pages/index.js', codigo: retorno(compila('function P(){ return (\n' + L.slice(i0 + 1, i1).join('\n') + '\n) }'), 'P') }
}
;(async () => {
  await prepara()
  const a = codigoDe(VIEJO, true), n = codigoDe(RAIZ, false)
  const igual = a.codigo === n.codigo
  if (!igual) { let k = 0; while (a.codigo[k] === n.codigo[k]) k++; console.log('primera diferencia en el carácter', k, '\n antes:', a.codigo.slice(Math.max(0, k - 80), k + 120), '\n ahora:', n.codigo.slice(Math.max(0, k - 80), k + 120)) }
  console.log(`backtesting-resultados: ${a.de} de antes (${a.codigo.length} caracteres) frente a ${n.de} de ahora (${n.codigo.length}): ${igual ? 'idéntico' : 'DISTINTO'}`)
  process.exit(igual ? 0 : 1)
})().catch(e => { console.error('FALLO', e.stack); process.exit(1) })
