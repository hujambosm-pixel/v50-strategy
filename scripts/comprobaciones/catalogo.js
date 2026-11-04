// scripts/comprobaciones/catalogo.js — el catálogo del paso 1 solo con condiciones y los «?» de los desplegables de «Cómo compro» y de
// «Stop de pérdidas» (docs/builder.md, §69). Montado con estado y efectos (domFalso.js), sin base de datos.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 20 } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: 20 } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }] }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), h = React.createElement
  const { renderToStaticMarkup } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const Ed = require(R + '/components/BuilderEditor.js'), T = require(R + '/lib/builder/tarjetas.js')
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' })
  const texto = (n) => n.nodeType === 3 ? (n.nodeValue ?? n.data ?? '') : (n.childNodes || []).map(texto).join('')
  const fila = (def) => ({ id: 'e1', name: 'Sigue la tendencia', description: '', definition: { ...def, nombre: 'Sigue la tendencia' }, params: { intervalo: 'diario' } })
  const monta = async (def = EMA) => { const f = fila(def); const m = D.monta(h(Ed.default, { fila: f, estrategias: [f], apiFetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), estadoInicial: { def: f.definition, valores: { intervalo: 'diario' }, nombre: f.name, descripcion: '' } }), RDC); await D.espera(30); return m }
  const ayudas = (m) => m.raiz.todos(n => n.nodeName === 'BUTTON' && (n.getAttribute('aria-label') || '').startsWith('Ayuda: ')).map(n => n.getAttribute('aria-label').slice(7))
  const select = (m, et) => m.raiz.busca(n => n.nodeName === 'SELECT' && n.getAttribute('aria-label') === et)
  const elige = async (m, et, v) => { D.propsDe(select(m, et)).onChange({ target: { value: v } }); await D.espera(20) }

  // ── 1 · El catálogo: solo condiciones ──
  let m = await monta()
  for (const g of m.raiz.todos(n => n.getAttribute('data-grupo') != null)) { const b = g.busca(n => n.nodeName === 'BUTTON'); if (g.getAttribute('data-abierto') !== 'si') D.pulsa(b) }
  await D.espera(20)
  const total = T.GRUPOS.reduce((s, g) => s + g.conds.length, 0)
  ok(m.raiz.todos(n => n.getAttribute('data-cond') != null).length === total, `con todos los grupos abiertos, las ${total} condiciones`)
  ok(m.raiz.todos(n => n.getAttribute('data-pieza') != null).length === 0, 'ninguna pieza dentro de los grupos ni fuera')
  ok(m.raiz.todos(n => n.getAttribute('data-grupo') === 'piezas').length === 0 && !texto(m.raiz).includes('Piezas de compra'), 'sin el apartado «Piezas de compra y de stop»')
  for (const id of ['swings', 'supertrend']) { const g = m.raiz.busca(n => n.getAttribute('data-grupo') === id); ok(!!g && g.todos(n => n.getAttribute('data-cond') != null).length === T.GRUPOS.find(x => x.id === id).conds.length && texto(g.busca(n => n.nodeName === 'BUTTON')).endsWith(String(T.GRUPOS.find(x => x.id === id).conds.length)), `el grupo «${id}» sigue, con sus condiciones, y su cifra las cuenta`) }

  // ── 2 · Toda pieza se puede elegir en su desplegable ──
  const opciones = (n) => n.todos(x => x.nodeName === 'OPTION').map(o => [o.getAttribute('value') ?? D.propsDe(o).value, texto(o)])
  const op = opciones(select(m, 'Cómo compro'))
  ok(op.map(o => o[0]).join() === T.TIPOS_ORDEN.map(o => o.modo).join() && op.every(([v, t]) => t.startsWith(T.TIPOS_ORDEN.find(o => o.modo === v).nombre)), 'las 6 opciones de «Cómo compro», con el mismo nombre en su «?»')
  const tiposStop = T.TIPOS_STOP.map(t => t.tipo)
  ok(T.PIEZAS.length === 8 && T.PIEZAS.every(p => tiposStop.includes(p.id) || T.TIPOS_ORDEN.some(o => o.modo === p.id)), 'las 8 piezas que salieron del catálogo están en un desplegable')
  m.quita(); await D.espera(5)

  // ── 3 · Los «?» de los desplegables: todas las opciones, con una línea y un ejemplo ──
  const htmlO = renderToStaticMarkup(Ed.AYUDA_OPCIONES_ORDEN), htmlS = renderToStaticMarkup(Ed.AYUDA_OPCIONES_STOP)
  ok(T.TIPOS_ORDEN.every(o => o.nombre && o.linea && o.ejemplo && htmlO.includes(o.nombre) && htmlO.includes(o.linea)) && htmlO.split('Ejemplo: ').length - 1 === 6, '«?» de «Cómo compro»: 6 opciones y 6 ejemplos')
  ok(T.TIPOS_STOP.every(o => o.nombre && o.linea && o.ejemplo && htmlS.includes(o.nombre) && htmlS.includes(o.linea)) && htmlS.split('Ejemplo: ').length - 1 === 10, '«?» de «Stop de pérdidas»: 10 opciones y 10 ejemplos')
  // Las cuentas de los ejemplos, a mano: 100 − 2 × 3 = 94 (ATR fijo); 2 × 3 = 6 € (ATR); 100 × (1 − 8 %) = 92 (porcentaje).
  ok(T.TIPOS_STOP.find(t => t.tipo === 'atrCompra').ejemplo.includes('94 €') && T.TIPOS_STOP.find(t => t.tipo === 'atr').ejemplo.includes('6 €') && T.TIPOS_STOP.find(t => t.tipo === 'porcentaje').ejemplo.includes('92 €'), 'las cuentas de los ejemplos cuadran')

  m = await monta()
  ok(ayudas(m).includes('Opciones de «Cómo compro»'), 'el «?» junto al desplegable de «Cómo compro»')
  ok(ayudas(m).includes('Opciones de «Stop de pérdidas»'), 'el «?» junto a «Stop de pérdidas» (con un stop puesto)')
  HTMLElement.prototype.cloneNode = HTMLElement.prototype.cloneNode || function () { const c = document.createElement('span'); c.remove = () => c.parentNode?.removeChild(c); return c }   // lo que usa la ventana del «?» para medirse
  D.pulsa(m.raiz.busca(n => n.getAttribute('aria-label') === 'Ayuda: Opciones de «Cómo compro»')); await D.espera(20)
  const abierto = document.body.busca(n => n.getAttribute('data-ayuda-opciones-orden') != null)
  ok(!!abierto && texto(abierto).includes('Orden en el nivel de ruptura.') && texto(abierto).includes('Ejemplo: con 20, el máximo'), 'al pulsarlo se abre con las opciones')
  m.quita(); await D.espera(5)
  m = await monta({ ...EMA, stops: [] })
  ok(ayudas(m).includes('Opciones de «Stop de pérdidas»'), 'el «?» de «Stop de pérdidas» también sin ningún stop')

  // ── 4 · El «+» que se va lo hacen los desplegables; y el «?» de lo ya elegido ──
  for (const [modo, et] of [['ruptura', 'Orden en el nivel de ruptura'], ['swing', 'Orden en el último máximo de swing'], ['lineaBajista', 'Orden en la línea de tendencia bajista'], ['supertrend', 'Orden en la línea del SuperTrend'], ['maximo', 'Orden en el máximo de la vela de la señal']]) {
    await elige(m, 'Cómo compro', modo)
    ok(select(m, 'Cómo compro') && D.propsDe(select(m, 'Cómo compro')).value === modo && ayudas(m).includes(et), `«Cómo compro» → ${modo}: elegida y con su «?»`)
  }
  m.quita(); await D.espera(5)
  for (const tipo of ['atrCompra', 'minimoMovil', 'swingMinimo', 'supertrend', 'emaMinimo']) {
    m = await monta({ ...EMA, stops: [] })
    await elige(m, 'Stop de pérdidas', tipo)
    const p = T.PIEZAS.find(x => x.id === tipo)
    ok(!!m.raiz.busca(n => n.getAttribute('data-stop') === tipo) && ayudas(m).some(a => a.startsWith('Stop') && (a === p.nombre || a.includes(p.nombre))), `stop ${tipo}: elegido en el desplegable y con su «?» (${p.nombre})`)
    m.quita(); await D.espera(5)
  }

  // ── 5 · El buscador, igual ──
  m = await monta()
  const caja = m.raiz.busca(n => n.getAttribute('data-buscar') === 'catalogo')
  D.propsDe(caja).onChange({ target: { value: 'swing' } }); await D.espera(20)
  ok(m.raiz.todos(n => n.getAttribute('data-cond') != null).length > 0 && m.raiz.todos(n => n.getAttribute('data-pieza') != null).length === 0, 'buscar «swing» encuentra sus condiciones')
  m.quita(); await D.espera(5)

  console.log(fallos ? `catalogo: ${fallos} fallos` : 'catalogo: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
