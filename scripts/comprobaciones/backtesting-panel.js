// scripts/comprobaciones/backtesting-panel.js — las piezas del panel izquierdo del Backtesting (components/backtesting/, fase 1 de «el
// plan con lista», docs/builder.md §76): las monta con renderToString en 400 estados al azar (semilla fija) cada una, en la versión
// anterior (VIEJO, la copia de comunes.sh) y en el árbol de trabajo, y exige el mismo HTML byte a byte. Además pulsa (con el DOM
// mínimo de domFalso.js) los controles de cada pieza y exige que llamen a los mismos «set…» con los mismos valores.
// Si la versión anterior aún no tiene las piezas, compara con el bloque de pages/index.js de esa versión (el que se sacó).
// Uso: VIEJO=<carpeta> node scripts/comprobaciones/backtesting-panel.js      Termina en 0 si todo es idéntico.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const fs = require('fs'), path = require('path')
const { prepara, registra, swc, RAIZ } = require('./cargador')
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const VIEJO = path.resolve(process.env.VIEJO)
const PIEZAS = ['PanelAsignacion', 'PanelEstrategias', 'PanelPesos', 'PanelUniverso', 'SelectorValores']
// Los bloques de pages/index.js de antes de la fase 1 (V9.1136), por su primera y última línea (con la sangría de entonces).
const BLOQUES = {
  PanelAsignacion: ['                {/* MODO DE ASIGNACIÓN — colapsable */}', '                {/* ESTRATEGIAS — colapsable */}'],
  PanelEstrategias: ['                {/* ESTRATEGIAS — colapsable */}', '                {/* Pesos personalizados'],
  PanelPesos: ['                {/* Pesos personalizados', '                {/* Universo: la lista manual'],
  PanelUniverso: ['                {/* Universo: la lista manual', '                {/* Selector de activos */}'],
  SelectorValores: ['                {/* Selector de activos */}', '            {/* ══ PANEL TRADELOG ══ */}'],
}
const out = (...a) => process.stdout.write(a.join(' ') + '\n')
let semilla = 20261106
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
const uno = (xs) => xs[Math.floor(azar() * xs.length)]
const algunos = (xs) => xs.filter(() => azar() < 0.5)

// Un estado al azar con TODAS las variables que usan las piezas (cada pieza toma las suyas).
const ESTRATEGIAS = [{ id: 'e1', name: 'Cruce de medias 50/200' }, { id: 'e2', name: 'Sigue la tendencia' }, { id: 'e3', name: '' }, { id: 'e4', name: 'Una estrategia con un nombre muy largo para ver el recorte' }]
const WATCH = [
  { symbol: 'AAPL', name: 'Apple Inc.', favorite: true, list_ids: ['l1'] }, { symbol: 'MSFT', name: 'Microsoft', favorite: false, list_ids: ['l1', 'l2'] },
  { symbol: 'NVDA', name: 'NVIDIA', favorite: true, list_ids: ['l2'] }, { symbol: 'AAPL', name: 'Apple (repetido)', favorite: false, list_ids: [] },
  { symbol: 'ASML', name: 'ASML Holding', favorite: false, list_ids: ['l2'] }, { symbol: 'TSLA', name: 'Tesla', favorite: false, list_ids: ['l1'] },
  { symbol: 'V', name: 'Visa', favorite: true, list_ids: [] }, { symbol: 'MA', name: 'Mastercard', favorite: false, list_ids: ['l1'] },
]
function estado() {
  const strats = uno([[], ['e1'], ['e2', 'e1'], ['e1', 'e2', '__portfolio__'], ['e1', 'e2', 'e3', 'e4']])
  const mcSelected = uno([[], ['AAPL'], ['AAPL', 'MSFT', 'NVDA'], WATCH.map(w => w.symbol).filter((s, i, a) => a.indexOf(s) === i)])
  const pesos = {}; for (const s of mcSelected) if (azar() < 0.8) pesos[s] = uno(['25', 10, '33.3', '', 0, 50])
  const ranking = {}; for (const s of algunos(['AAPL', 'MSFT', 'NVDA', 'ASML', 'TSLA'])) ranking[s] = { rank: uno([1, 2, 3, 7, 15]) }
  return {
    mcAssumedStopPct: uno([8, 5.5]), mcCalculoPrioridad: uno([1, 2]), mcCriterioUso: uno(['desempate', 'filtro']), mcMaxAccumRisk: uno([6, 20]),
    mcMaxPortfolioPct: uno([25, 40]), mcMaxPosiciones: uno([1, 4, 20]), mcMode: uno(['slots', 'compartido', 'concentrado', 'positionsizing', 'custom', 'raro']),
    mcMomGateThr: uno([10, 2.5]), mcMomentumN: uno([20, 63]), mcPrioridad: uno(['score_metricas', 'alfabetico', 'momentum', 'fuerza_relativa', 'max52', 'ranking']),
    mcProxGateThr: uno([10, 0]), mcRiskPerTrade: uno([1, 2.5]), mcRsGateThr: uno([0, 1.5]), mcRsWindow: uno([63, 13]),
    mcSectionOpen: { mode: azar() < 0.7, strats: azar() < 0.7 }, mcStratSelected: strats, mcUniverso: uno(['manual', 'manual', 'ndx_vol_10', 'ndx_vol_30', 'ndx_mom_20']),
    selectedModos: uno([['slots'], ['compartido'], ['concentrado'], ['positionsizing'], ['concentrado', 'positionsizing'], ['slots', 'compartido', 'concentrado', 'positionsizing']]),
    currentStratId: uno(['e1', 'e2', null]), mcPortfolioTipOpen: azar() < 0.3, strLoading: azar() < 0.15, strategies: uno([[], ESTRATEGIAS, ESTRATEGIAS.slice(0, 2)]),
    mcSelected, mcWeights: pesos, mcUniversoDatos: uno([{}, { ndx_vol_10: { error: 'x' } }]),
    mcListFilter: uno(['', '', 'Tecnológicas', 'Pagos']), mcOnlyFavs: azar() < 0.3, mcSearch: uno(['', '', 'a', 'APPLE', 'zz']),
    rankingData: ranking, watchlist: uno([WATCH, WATCH.slice(0, 3), []]), wlLists: [{ id: 'l1', name: 'Tecnológicas' }, { id: 'l2', name: 'Pagos' }],
  }
}
// Los «set…» graban lo que reciben; las funciones (p. ej. s => ({...s, mode: !s.mode})) se aplican sobre el valor de antes.
function conSetters(e, registro) {
  const p = { ...e }
  for (const k of Object.keys(e)) { const set = 'set' + k[0].toUpperCase() + k.slice(1); p[set] = (v) => registro.push([set, typeof v === 'function' ? v(e[k]) : v]) }
  return p
}
// La pieza «de antes» sacada de pages/index.js de la versión anterior: el bloque entre sus dos marcas, envuelto en una función.
function piezaDelIndice(raiz, nombre) {
  const L = fs.readFileSync(path.join(raiz, 'pages/index.js'), 'utf8').replace(/\r\n/g, '\n').split('\n')
  const [a, b] = BLOQUES[nombre]
  const i = L.findIndex(x => x.startsWith(a)), j = L.findIndex((x, k) => k > i && x.startsWith(b))
  if (i < 0 || j < 0) throw new Error('no encuentro el bloque ' + nombre)
  let bloque = L.slice(i + 1, j)
  while (bloque.length && !bloque[bloque.length - 1].trim()) bloque.pop()
  if (nombre === 'SelectorValores') bloque = bloque.slice(0, -2)   // quita el cierre del panel y el «)}»
  const codigo = `import { MONO } from '${RAIZ.replace(/\\/g, '/')}/lib/utils'\nimport Tip from '${raiz.replace(/\\/g, '/')}/components/Tip'\n` +
    `import AvisoUniverso from '${raiz.replace(/\\/g, '/')}/components/AvisoUniverso'\nimport ConLimpiar from '${raiz.replace(/\\/g, '/')}/components/LimpiarBusqueda'\n` +
    `import { reglaDeUniverso, FRASE_REGLA } from '${raiz.replace(/\\/g, '/')}/lib/universoMc'\n` +
    `const STRAT_COMPARE_COLORS=['#00d4ff','#ff6b9d','#ff9a3c','#00e5a0','#c3e63a','#e879f9','#5ea8ff','#ff5c5c']\n` +
    `export default function P(props) { const {${Object.keys(conSetters(estado(), [])).join(',')}} = props\n return (<>\n${bloque.join('\n')}\n</>) }\n`
  const js = swc.transformSync(codigo, { filename: nombre + '.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } }).code
  const f = path.join(__dirname, 'salida', `.antes_${nombre}.js`)
  fs.writeFileSync(f, js); delete require.cache[f]
  return require(f).default
}
const pieza = (raiz, nombre) => fs.existsSync(path.join(raiz, 'components/backtesting', nombre + '.js'))
  ? require(path.join(raiz, 'components/backtesting', nombre + '.js')).default : piezaDelIndice(raiz, nombre)

;(async () => {
  await prepara(); registra(VIEJO); registra(RAIZ)
  const dom = require('./domFalso'); dom.pon()
  const React = require('react'), { renderToString } = require('react-dom/server')
  const cliente = require('react-dom/client')
  let fallos = 0, casos = 0, pulsaciones = 0
  for (const nombre of PIEZAS) {
    const A = pieza(VIEJO, nombre), N = pieza(RAIZ, nombre)
    let iguales = 0, vacios = 0
    for (let k = 0; k < 400; k++) {
      const e = estado()
      const ha = renderToString(React.createElement(A, conSetters(e, []))), hn = renderToString(React.createElement(N, conSetters(e, [])))
      casos++; if (ha === hn) iguales++; else { fallos++; if (fallos < 4) out('DISTINTO', nombre, k, '\n antes:', ha.slice(0, 300), '\n ahora:', hn.slice(0, 300)) }
      if (!hn) vacios++
      // Pulsar: cada nodo con onClick / onChange / onMouseEnter… en las dos versiones, en el mismo orden, y comparar lo que graban.
      if (k % 8 === 0) {
        const graba = async (C) => {
          const reg = [], m = dom.monta(React.createElement(C, conSetters(e, reg)), cliente)
          await dom.espera(5)
          for (const n of m.raiz.todos(() => true)) {
            const pr = dom.propsDe(n)
            for (const ev of ['onClick', 'onChange', 'onMouseEnter', 'onMouseLeave', 'onMouseOver', 'onMouseOut']) {
              if (typeof pr[ev] !== 'function') continue
              const opciones = n.todos(x => x.nodeName === 'OPTION').map(o => o.getAttribute('value'))
              const t = { value: opciones.length ? opciones[opciones.length - 1] : '7' }
              try { pr[ev]({ target: t, currentTarget: { style: {} }, stopPropagation() {}, preventDefault() {} }) } catch (err) { reg.push(['error', ev, String(err.message)]) }
              reg.push(['·', n.nodeName, ev]); pulsaciones++
            }
          }
          m.quita(); await dom.espera(1)
          return JSON.stringify(reg)
        }
        const ra = await graba(A), rn = await graba(N)
        if (ra !== rn) { fallos++; if (fallos < 4) out('PULSAR DISTINTO', nombre, k, '\n antes:', ra.slice(0, 400), '\n ahora:', rn.slice(0, 400)) }
      }
    }
    out(`${nombre}: ${iguales}/400 iguales (vacías: ${vacios})`)
  }
  out(`backtesting-panel: ${casos} montajes, ${pulsaciones / 2} pulsaciones por versión, fallos: ${fallos}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('FALLO', e.stack); process.exit(1) })
