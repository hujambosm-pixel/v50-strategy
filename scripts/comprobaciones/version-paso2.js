// scripts/comprobaciones/version-paso2.js — «versión 2» desde las pruebas del paso 2, la guardia del paso 1 al ir a una tesis y la guía al día (docs/builder.md, §63). Montado con estado y efectos (domFalso.js, la base simulada). Las corre comunes.sh. Termina en 0 si todo va bien.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), h = React.createElement
  const Ed = require(R + '/components/BuilderEditor.js'), BP = require(R + '/components/BuilderPanel.js').default, V = require(R + '/lib/builder/versiones.js')
  const fila = { id: 'e1', name: 'Mi EMA', description: 'una', definition: { ...EMA, nombre: 'Mi EMA', descripcion: 'una' }, params: { ema: 20, intervalo: 'diario' } }
  const foto = (def = fila.definition, params = fila.params, name = fila.name) => ({ id: fila.id, name, definition: def, params })
  const prueba = (o = {}) => ({ id: 1, creada_en: '2026-10-30T10:00:00Z', estrategia_id: 'e1', estrategia_nombre: 'Mi EMA', estrategia_foto: foto(), estrategia_huella: 'h', valor: 'AAPL', velas: 'diarias', res: null, ...o })

  // ── 1 · Qué prueba cuenta ──
  const reglaDe = (ema) => [fila.definition, { ema, intervalo: 'diario' }]
  ok(V.pruebasDeLaRegla([prueba()], ...reglaDe(20)).join() === 'Prueba contra el azar · AAPL · velas diarias del 30/10/2026', 'la que probó esta regla: su nombre')
  ok(V.pruebasDeLaRegla([prueba()], ...reglaDe(50)).length === 0, 'una prueba de otra regla no cuenta')
  ok(V.pruebasDeLaRegla([prueba({ estrategia_foto: foto({ ...fila.definition, nombre: 'Otro nombre', descripcion: 'otra' }) })], ...reglaDe(20)).length === 1, 'cambiar el nombre o la descripción no la saca de su prueba')
  ok(V.pruebasDeLaRegla([], ...reglaDe(20)).length === 0 && V.pruebasDeLaRegla(null, ...reglaDe(20)).length === 0 && V.pruebasDeLaRegla([{ id: 9 }], ...reglaDe(20)).length === 0, 'sin pruebas, o una sin foto: ninguna, sin error')

  // ── 2 · Guardar, montado de verdad ──
  const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
  const base = (pruebas, o = {}) => { const b = { pruebas, leidas: [] }
    globalThis.fetch = async (u) => { const s = String(u)
      if (s.includes('pruebas_azar')) { b.leidas.push(s); if (o.falla) return { ok: false, status: 500, json: async () => ({}) }; return J(b.pruebas) }
      if (s.includes('tesis_inversion')) return J(o.tesis || [])
      return J([]) }
    return b }
  const servidor = (o = {}) => { const a = []; const f = async (u, q = {}) => { if (u === '/api/strategies') { a.push({ metodo: q.method, cuerpo: JSON.parse(q.body) }); if (o.falla) return { ok: false, status: 500, json: async () => ({ error: 'falla la base' }) }; return { ok: true, status: 200, json: async () => ({ id: q.method === 'POST' ? 'e2' : JSON.parse(q.body).id }) } } return { ok: false, status: 404, json: async () => ({}) } }; f.llamadas = a; return f }
  const q = (m, k, v) => m.raiz.busca(n => n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const LARGO = 300
  // Esperar a lo que se busca, no un tiempo fijo (el equipo puede ir cargado): cada 5 ms, 20 s como máximo; el ok() de después da el veredicto.
  const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
  const avisaVersion = (x) => { const n = q(x, 'data-boton', 'guardar-valores'); return !!n && (n.getAttribute('title')?.includes('versión 2') || D.propsDe(n).title?.includes('versión 2')) }
  const est = (o = {}) => ({ def: fila.definition, valores: { ema: 20, intervalo: 'diario' }, nombre: 'Mi EMA', descripcion: 'una', ...o })
  const montaEd = async (estadoInicial, api, extra = {}) => { const guardadas = []; const m = D.monta(h(Ed.default, { fila, estrategias: [fila], apiFetch: api, estadoInicial, onGuardada: (x, i) => guardadas.push([x, i]), ...extra }), RDC); await D.espera(LARGO); m.guardadas = guardadas; return m }
  const copiaFila = JSON.stringify(fila)

  let b = base([prueba()]), api = servidor(), m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api); await hasta(() => avisaVersion(m))
  ok(b.leidas.length === 1 && b.leidas[0].includes('estrategia_id=eq.e1'), 'lee las pruebas de esa estrategia')
  ok(q(m, 'data-boton', 'guardar-valores').getAttribute('title')?.includes('versión 2') || D.propsDe(q(m, 'data-boton', 'guardar-valores')).title.includes('versión 2'), 'antes de guardar, el botón avisa de la versión 2')
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  let l = api.llamadas
  ok(l.length === 1 && l[0].metodo === 'POST' && l[0].cuerpo.name === 'Mi EMA · versión 2' && l[0].cuerpo.params.ema === 50 && !('id' in l[0].cuerpo), `cambiar la regla: POST de «${l[0]?.cuerpo.name}», nueva, sin tocar la original`)
  ok(l.every(x => x.metodo !== 'PUT') && JSON.stringify(fila) === copiaFila, 'la original no se escribe')
  m.quita(); await D.espera(5)

  b = base([prueba()]); api = servidor(); m = await montaEd(est({ nombre: 'Otro nombre', descripcion: 'otra' }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  l = api.llamadas
  ok(l.length === 1 && l[0].metodo === 'PUT' && l[0].cuerpo.id === 'e1' && l[0].cuerpo.name === 'Otro nombre' && l[0].cuerpo.params.ema === 20, 'cambiar nombre y descripción: PUT sobre la misma')
  m.quita(); await D.espera(5)

  b = base([]); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  ok(api.llamadas[0]?.metodo === 'PUT' && api.llamadas[0].cuerpo.id === 'e1' && api.llamadas[0].cuerpo.name === 'Mi EMA', 'sin prueba: cambiar la regla se guarda sobre la misma')
  m.quita(); await D.espera(5)

  b = base([prueba({ estrategia_foto: foto(fila.definition, { ema: 10, intervalo: 'diario' }) })]); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  ok(api.llamadas[0]?.metodo === 'PUT', 'con una prueba de una regla anterior: se guarda sobre la misma'); m.quita(); await D.espera(5)

  b = base([prueba()], { falla: true }); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  ok(!!q(m, 'data-aviso', 'pruebas-sin-leer'), 'si no se pueden leer sus pruebas: lo avisa en una línea'); m.quita(); await D.espera(5)
  b = base([prueba()]); m = await montaEd(est(), servidor())
  ok(!q(m, 'data-aviso', 'pruebas-sin-leer'), 'si se pueden leer: sin aviso'); m.quita(); await D.espera(5)

  // Nueva o copia, sin id: no pide nada.
  b = base([prueba()]); m = await montaEd(null, servidor(), { fila: { ...fila, id: null, name: 'Copia', copiaDe: 'Mi EMA' } })
  ok(b.leidas.length === 0, 'una copia sin guardar no pide pruebas'); m.quita(); await D.espera(5)

  // ── 3 · La guardia del paso 1, con el Builder de verdad ──
  const tesis = [{ id: 7, titulo: 'Mi tesis', relacionados: [{ tipo: 'estrategia', id: 'e1' }], created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', revisada_en: null }]
  const nombre = (x) => x.raiz.busca(n => n.getAttribute('id') === 'nombre-estrategia')
  const abre = async (apiX, o = {}) => { b = base([prueba()], { tesis, ...o }); const a = []; const x = D.monta(h(BP, { estrategias: [fila], visible: true, apiFetch: apiX, vistaInicial: { editor: fila }, onAbrirTesis: id => a.push(id), onGuardada: () => {} }), RDC); await D.espera(LARGO); x.abiertas = a; return x }
  m = await abre(servidor())
  ok(!!q(m, 'data-enlace-tesis', 7), 'el paso 1 enseña su tesis')
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10)
  ok(m.abiertas.join() === '7' && !q(m, 'data-pregunta', 'sin-guardar'), 'sin cambios: va a la tesis, sin preguntar'); m.quita(); await D.espera(5)

  m = await abre(servidor()); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10)
  const ven = q(m, 'data-pregunta', 'sin-guardar')
  ok(!!ven && m.abiertas.length === 0 && ven.textContent.includes('Tienes cambios sin guardar en «Otro»') && !!q(m, 'data-salida', 'guardar') && !!q(m, 'data-salida', 'salir') && !!q(m, 'data-salida', 'cancelar'), 'con cambios: la ventana propia, Guardar / Salir sin guardar / Cancelar, y no se va')
  D.pulsa(q(m, 'data-salida', 'cancelar')); await D.espera(10)
  ok(!q(m, 'data-pregunta', 'sin-guardar') && m.abiertas.length === 0 && nombre(m).value === 'Otro', '«Cancelar»: sigue ahí, con lo escrito')
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'salir')); await D.espera(LARGO)
  ok(m.abiertas.join() === '7' && nombre(m).value === 'Mi EMA', '«Salir sin guardar»: va a la tesis y vuelve a lo guardado'); m.quita(); await D.espera(5)

  api = servidor(); m = await abre(api); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(api.llamadas.length === 1 && api.llamadas[0].metodo === 'PUT' && api.llamadas[0].cuerpo.name === 'Otro' && m.abiertas.join() === '7', '«Guardar» (solo el nombre): PUT sobre la misma y va a la tesis'); m.quita(); await D.espera(5)

  api = servidor({ falla: true }); m = await abre(api); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(m.abiertas.length === 0 && q(m, 'data-pregunta', 'sin-guardar')?.textContent.includes('falla la base'), 'si «Guardar» falla: lo dice, sigue la ventana y no se va'); m.quita(); await D.espera(5)

  // §72: el menú, el logo y «Salir» preguntan por el ref «salida»; la ruta de arriba y los pasos, también.
  const abreS = async (apiX) => { b = base([prueba()], { tesis }); const salida = { current: null }; const x = D.monta(h(BP, { estrategias: [fila], salida, visible: true, apiFetch: apiX, vistaInicial: { editor: fila }, onAbrirTesis: () => {}, onGuardada: () => {} }), RDC); await D.espera(LARGO); x.salida = salida; return x }
  const enPaso1 = (x) => !!nombre(x)
  const escribeS = async (x, v) => { const antes = x.salida.current; D.escribe(nombre(x), v); await hasta(() => x.salida.current !== antes && nombre(x).value === v) }
  m = await abreS(servidor()); let fuera = 0
  ok(typeof m.salida.current === 'function' && m.salida.current(() => { fuera++ }) === false && fuera === 0 && !q(m, 'data-pregunta', 'sin-guardar'), 'menú o logo sin cambios: no pregunta; la página sigue')
  await escribeS(m, 'Otro')
  ok(m.salida.current(() => { fuera++ }) === true, 'con cambios, la página no sale: pregunta el paso 1'); await hasta(() => !!q(m, 'data-pregunta', 'sin-guardar'))
  ok(!!q(m, 'data-pregunta', 'sin-guardar') && fuera === 0, 'sale la ventana y no se va')
  D.pulsa(q(m, 'data-salida', 'cancelar')); await D.espera(10)
  ok(fuera === 0 && nombre(m).value === 'Otro', '«Cancelar»: sigue ahí, con lo escrito')
  m.salida.current(() => { fuera++ }); await hasta(() => !!q(m, 'data-salida', 'salir')); D.pulsa(q(m, 'data-salida', 'salir')); await D.espera(LARGO)
  ok(fuera === 1 && nombre(m).value === 'Mi EMA', '«Salir sin guardar»: se va y vuelve a lo guardado'); m.quita(); await D.espera(5)
  ok(m.salida.current === null, 'al cerrar el paso 1, el ref queda libre')
  api = servidor(); m = await abreS(api); fuera = 0; await escribeS(m, 'Otro')
  m.salida.current(() => { fuera++ }); await hasta(() => !!q(m, 'data-salida', 'guardar')); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(fuera === 1 && api.llamadas.length === 1 && api.llamadas[0].cuerpo.name === 'Otro', '«Guardar»: guarda y se va'); m.quita(); await D.espera(5)
  m = await abreS(servidor()); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-ruta', 'mi-trabajo')); await D.espera(10)
  ok(!!q(m, 'data-pregunta', 'sin-guardar') && enPaso1(m), '«Mi trabajo» de la ruta con cambios: pregunta y no se va')
  D.pulsa(q(m, 'data-salida', 'salir')); await D.espera(LARGO)
  ok(!enPaso1(m) && !!q(m, 'data-buscar', 'mi-trabajo'), '«Salir sin guardar»: va a Mi trabajo'); m.quita(); await D.espera(5)
  m = await abreS(servidor()); D.pulsa(q(m, 'data-ruta', 'mi-trabajo')); await D.espera(LARGO)
  ok(!enPaso1(m) && !q(m, 'data-pregunta', 'sin-guardar'), '«Mi trabajo» sin cambios: va sin preguntar'); m.quita(); await D.espera(5)
  // §139: el título es el nombre; ruta «Estrategias ›»; dos pasos; «Usar en un plan» con la misma guardia de cambios sin guardar.
  m = await abreS(servidor()); const botones = (x) => x.raiz.todos(n => n.nodeName === 'BUTTON').map(n => n.textContent)
  ok(nombre(m)?.nodeName === 'INPUT' && nombre(m).value === 'Mi EMA' && !q(m, 'data-tarjeta', 'nombre') && !m.raiz.textContent.includes('Paso 1 · Crear la estrategia'), '§139: el título es el nombre, sin caja aparte ni «Paso 1 · Crear la estrategia»')
  ok(!!q(m, 'data-paso', 2) && !q(m, 'data-paso', 3) && q(m, 'data-ruta', 'mi-trabajo')?.textContent === 'Estrategias' && !q(m, 'data-ruta', 'builder'), '§139: ruta «Estrategias ›» y dos pasos, sin el 3')
  ok(['Descartar cambios', 'Guardar', 'Guardar y validar ›', 'Usar en un plan'].every(t => botones(m).includes(t)) && !botones(m).some(t => /Volver a los guardados|Guardar en la estrategia|pasar al paso 2|Guía: cómo/.test(t)), `§139: los botones con su nombre nuevo y la guía fuera del paso 1`)
  D.escribe(nombre(m), 'Otro'); await D.espera(10); D.pulsa(q(m, 'data-boton', 'usar-en-plan')); await D.espera(10)
  ok(!!q(m, 'data-pregunta', 'sin-guardar') && enPaso1(m), '§139: «Usar en un plan» con cambios: pregunta y no se va')
  D.pulsa(q(m, 'data-salida', 'salir')); await D.espera(LARGO)
  ok(!enPaso1(m) && !!q(m, 'data-pantalla', 'plan') && q(m, 'data-ruta', 'mi-trabajo')?.textContent === 'Planes' && !q(m, 'data-paso', 1), '§139: «Salir sin guardar»: abre el plan, con la ruta «Planes ›» y sin pasos'); m.quita(); await D.espera(5)
  m = await abreS(servidor()); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-paso', 2)); await D.espera(10)
  ok(!!q(m, 'data-pregunta', 'sin-guardar') && enPaso1(m), 'el paso 2 de arriba con cambios: pregunta y no se va')
  D.pulsa(q(m, 'data-salida', 'cancelar')); await D.espera(10); m.quita(); await D.espera(5)
  // Cambiar la regla de una con prueba y «Guardar» desde los pasos: crea «· versión 2» y sigue con ESA, no con la original.
  b = base([prueba()], { tesis }); let aPaso2 = null
  m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api = servidor(), { onPaso2: (f) => { aPaso2 = f }, onPaso3: () => {} })
  D.pulsa(q(m, 'data-paso', 2)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(api.llamadas[0]?.cuerpo.name === 'Mi EMA · versión 2' && aPaso2?.id === 'e2' && aPaso2?.name === 'Mi EMA · versión 2', 'desde los pasos, «Guardar» con otra regla crea «· versión 2» y sigue con ella'); m.quita(); await D.espera(5)

  // ── 3b · §64: renombrar no quita la prueba; cambiar la regla, sí ──
  const Pa = require(R + '/lib/builder/planPantalla.js'), PA = require(R + '/lib/pruebaAzar.js'), Ml = require(R + '/lib/builder/misListas.js'), Lt = require(R + '/lib/lotesLab.js')
  const fotoOriginal = PA.fotoDe(fila), huellaOriginal = await PA.huellaEstrategia(fila)
  const conResultado = (veredicto) => ({ ...prueba({ estrategia_foto: fotoOriginal, estrategia_huella: huellaOriginal }), res: { id: 1, veredicto, texto: veredicto === 'pasa' ? 'Pasa' : 'No pasa' }, resultado: { id: 1, veredicto, texto: veredicto === 'pasa' ? 'Pasa' : 'No pasa' } })
  const renombrada = { ...fila, name: 'Nombre nuevo', description: 'otra', definition: { ...fila.definition, nombre: 'Nombre nuevo', descripcion: 'otra' } }
  const otraRegla = { ...fila, params: { ema: 50, intervalo: 'diario' } }
  ok(await PA.huellaEstrategia(renombrada) !== huellaOriginal, 'al renombrar cambia la huella de ahora (por eso no sirve para decidir)')
  ok(PA.reglaDeFoto(PA.fotoDe(renombrada)) === PA.reglaDeFoto(fotoOriginal), 'pero no su regla')
  ok(PA.reglaDeFoto(PA.fotoDe(otraRegla)) !== PA.reglaDeFoto(fotoOriginal), 'y cambiar un valor sí cambia la regla')
  const filaMT = async (s, v) => (await Ml.construyeMisEstrategias({ estrategias: [s], planes: [], pruebasAzar: [conResultado(v)] }))[0]
  for (const [v, clave] of [['noPasa', 'noPasa'], ['pasa', 'pasa']]) {
    ok((await filaMT(fila, v)).azar.clave === clave, `Mi trabajo, sin tocarla: ${clave}`)
    ok((await filaMT(renombrada, v)).azar.clave === clave && !!(await filaMT(renombrada, v)).azar.fila, `Mi trabajo, renombrada: sigue en ${clave}, con su prueba`)
    ok((await filaMT(otraRegla, v)).azar.clave === 'sinPrueba', 'Mi trabajo, con otra regla: «Sin probar»')
  }
  ok(Pa.estadoPrueba([conResultado('pasa')], Pa.reglaDe(renombrada)).clave === 'pasa' && Pa.estadoPrueba([conResultado('pasa')], Pa.reglaDe(otraRegla)).clave === 'sinPrueba', 'paso 3: la misma cuenta')
  ok(Pa.estadoPrueba([{ ...conResultado('pasa'), estrategia_foto: null }], Pa.reglaDe(fila)).clave === 'sinPrueba' && Pa.estadoPrueba(null, Pa.reglaDe(fila)) === null, 'una fila sin foto no cuenta; sin leer, nada')
  ok(Pa.estadosPrueba([renombrada, { ...otraRegla, id: 'e2' }], [conResultado('noPasa')]).e1 === 'noPasa', 'el desplegable del paso 3, por regla')
  ok(JSON.stringify(fotoOriginal) === JSON.stringify(PA.fotoDe(fila)) && conResultado('pasa').estrategia_huella === huellaOriginal, 'la foto y la huella de la prueba no se tocan')
  // Montado: «Mi trabajo» y el paso 3, con la estrategia renombrada y la prueba en la base simulada.
  const celdaAzar = (x, id) => x.raiz.busca(n => n.getAttribute('data-fila-estrategia') === id)?.busca(n => n.getAttribute('data-azar') != null)
  const planesVacios = (f0) => async (u, o) => String(u).includes('planes_inversion') ? J([]) : f0(u, o)
  for (const [t, s, azar, aviso] of [['renombrada', renombrada, 'noPasa', 'prueba del paso 2 ✕ No pasa'], ['con otra regla', otraRegla, 'sinPrueba', 'sin prueba del paso 2']]) {
    b = base([conResultado('noPasa')]); globalThis.fetch = planesVacios(globalThis.fetch)
    m = D.monta(h(BP, { estrategias: [s], visible: true, apiFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), abrir: null }), RDC); await D.espera(LARGO)
    ok(celdaAzar(m, 'e1')?.getAttribute('data-azar') === azar, `Mi trabajo montado, ${t}: ${celdaAzar(m, 'e1')?.textContent}`); m.quita(); await D.espera(5)
    b = base([conResultado('noPasa')]); globalThis.fetch = planesVacios(globalThis.fetch)
    m = D.monta(h(BP, { estrategias: [s], visible: true, apiFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), vistaInicial: { plan: { estrategiaId: 'e1' } } }), RDC); await D.espera(LARGO)
    const av = q(m, 'data-aviso', 'prueba')
    ok(av?.textContent.includes(aviso), `paso 3 montado, ${t}: ${av?.textContent}`); m.quita(); await D.espera(5)
  }
  // Y renombrada, una regla nueva sigue creando la versión 2.
  b = base([conResultado('noPasa')]); api = servidor(); m = D.monta(h(Ed.default, { fila: renombrada, estrategias: [renombrada], apiFetch: api, estadoInicial: est({ def: renombrada.definition, nombre: 'Nombre nuevo', descripcion: 'otra', valores: { ema: 50, intervalo: 'diario' } }), onGuardada: () => {} }), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  ok(api.llamadas[0]?.metodo === 'POST' && api.llamadas[0].cuerpo.name === 'Nombre nuevo · versión 2', `renombrada y con otra regla: ${api.llamadas[0]?.cuerpo.name}`); m.quita(); await D.espera(5)
  // Sin cambiar nada de la prueba de EMA20: su foto da su regla, igual que su estrategia.
  const ema = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'prueba-ema20/prueba.json'), 'utf8'))
  ok(!!PA.reglaDeFoto(ema.estrategia_foto) && await Lt.huella(ema.estrategia_foto) === ema.estrategia_huella, 'EMA20: su huella congelada sigue siendo la de su foto')

  // ── 4 · La guía ──
  const { GUIA } = require(R + '/lib/builder/ayuda.js'), texto = JSON.stringify(GUIA)
  for (const x of ['laboratorio', 'Laboratorio', 'lote', 'Nasdaq', 'sesgos', 'QQQ', 'P5–P95', 'No llega', 'misma duración', '500 copias']) ok(!texto.includes(x), `la guía no habla de «${x}»`)
  for (const x of ['1.000 copias', '200 mercados ficticios', 'bloques de 20', 'versión 2', '2016–2020', '2021–2025', 'menos de 30 operaciones', 'pasó por suerte', 'Sin veredicto', 'Ver en velas']) ok(texto.includes(x), `la guía dice «${x}»`)
  ok(GUIA.every(g => g.titulo && g.parrafos.length), 'cada apartado con su texto')
  const G = D.monta(h(require(R + '/components/BuilderGuia.js').default, { onVolver: () => {} }), RDC); await D.espera(5)
  ok(G.raiz.conAtributo('data-guia').length === GUIA.length && !G.raiz.textContent.includes('laboratorio'), `la pantalla de la guía: ${GUIA.length} apartados, sin laboratorios`); G.quita()

  // ── 5 · El aviso del plan compara solo la regla y los textos de ejemplo (§68) ──
  const { comparaEstrategia } = require(R + '/lib/builder/planesGuardados.js')
  const planCon = (f) => ({ piezas: [{ tipo: 'estrategia', estrategia: f }] }), plan = planCon(foto()), copiaPlan = JSON.stringify(plan)
  const cambia = async (x) => (await comparaEstrategia(plan, [{ ...fila, ...x }])).cambiada
  ok(await cambia({}) === false, 'plan: sin cambios, sin aviso')
  ok(await cambia({ name: 'Otro nombre' }) === false && await cambia({ description: 'otra' }) === false && await cambia({ definition: { ...fila.definition, nombre: 'Otro', descripcion: 'otra' } }) === false, 'plan: otro nombre u otra descripción, sin aviso')
  ok(await cambia({ params: { ema: 30, intervalo: 'diario' } }) === true && await cambia({ definition: { ...fila.definition, stops: [{ id: 'inicial', pct: 5, tipo: 'porcentaje', motivo: 'stop' }] } }) === true, 'plan: otra regla (un número o un stop), con aviso')
  ok((await comparaEstrategia(plan, [])).borrada === true, 'plan: estrategia borrada, como siempre')
  ok(JSON.stringify(plan) === copiaPlan, 'la copia guardada en el plan no cambia')
  const fuentes = ['components/BuilderCodigo.js', 'components/BuilderEditor.js', 'components/TesisEnlace.js', 'lib/builder/enlaces.js', 'lib/builder/misListas.js', 'lib/builder/ayuda.js', 'lib/builder/planPantalla.js', 'lib/tesis.js'].map(a => require('fs').readFileSync(path.join(R, a), 'utf8')).join('\n')
  for (const x of ['«V50 EMA10/11»', '«SuperTrend 10/3»', '«Growth investing»', '«EMA20»', '«EMA20 con', '«EMA20 en AAPL', 'EMA20 en AAPL compra', 'Copia editor 23', 'laboratorios de la prueba']) ok(!fuentes.includes(x), `ya no sale ${x}`)

  console.log(fallos ? `version-paso2: ${fallos} fallos` : 'version-paso2: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
