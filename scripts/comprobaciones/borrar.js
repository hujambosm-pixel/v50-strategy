// scripts/comprobaciones/borrar.js — borrar pruebas y estrategias (docs/builder.md, §60), MONTADO con estado y efectos (domFalso.js, la base simulada). Las corre comunes.sh. Termina en 0 si todo va bien.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
const AVISO = 'puedes estar quedándote con una que pasó por suerte'

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  const h = React.createElement
  const BP = require(R + '/components/BuilderPanel.js').default, BPlan = require(R + '/components/BuilderPlan.js').default, Pa = require(R + '/lib/builder/planPantalla.js'), Pl = require(R + '/lib/planes/plan.js'), PA = require(R + '/lib/pruebaAzar.js')
  const est = (id, name) => ({ id, name, definition: EMA, params: { ema: 2 } })
  const ests = [est('e1', 'Con prueba y plan'), est('e2', 'Sin nada')]
  const prueba = (id, e = 'e1') => ({ id, creada_en: '2026-10-30T10:00:00Z', estrategia_id: e, estrategia_nombre: 'Con prueba y plan', estrategia_foto: PA.fotoDe(ests[0]), valor: 'AAPL', velas: 'diarias', res: { id: 1, creado_en: '2026-10-30T10:00:00Z', veredicto: 'noPasa', texto: 'No pasa' } })
  const planFila = (id, nombre, e) => ({ id, nombre, huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', plan: Pa.planDe({ ...Pa.AJUSTES_PLAN, ocioso: 'GLD' }, e, nombre) })
  const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
  const base = (o = {}) => {
    const b = { pruebas: o.pruebas || [prueba(1)], planes: o.planes || [planFila(5, 'Mi plan', ests[0])], borrados: [], escritos: [] }
    globalThis.fetch = async (u, q = {}) => {
      const s = String(u), m = q.method || 'GET'
      if (m === 'DELETE') {
        b.borrados.push(s.replace('https://falso.invalid/rest/v1/', ''))
        if (o.falla && s.includes(o.falla)) return { ok: false, status: 500, json: async () => ({}) }
        if (s.includes('pruebas_azar?id=eq.')) { const id = Number(s.split('eq.')[1]); const x = b.pruebas.filter(p => p.id === id); b.pruebas = b.pruebas.filter(p => p.id !== id); return J(x) }
        if (s.includes('pruebas_azar?estrategia_id=eq.')) { const e = s.split('eq.')[1]; const x = b.pruebas.filter(p => p.estrategia_id === e); b.pruebas = b.pruebas.filter(p => p.estrategia_id !== e); return J(x) }
        if (s.includes('strategies?id=eq.')) return J([{ id: s.split('eq.')[1] }])
      }
      if (m !== 'GET' && !s.includes('builder_pestanas')) b.escritos.push(s)
      if (s.includes('builder_pestanas')) return m === 'POST' ? J(null, 201) : J([{ planes: b.planes.map(p => p.id) }])
      if (s.includes('planes_inversion')) return J(b.planes)
      if (s.includes('pruebas_azar')) { if (o.sinLeer) return { ok: false, status: 500, json: async () => ({}) }; return J(b.pruebas) }
      return J([])
    }
    return b
  }
  const api = async () => ({ ok: false, status: 500, json: async () => ({ error: 'sin motor en esta prueba' }) })
  const props = (x = {}) => ({ estrategias: ests, visible: true, apiFetch: api, abrir: null, ...x })
  const LARGO = 150
  const q = (m, k, v) => m.raiz.busca(n => n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const ventana = (m, id) => m.raiz.conAtributo('data-pregunta', id)[0]

  // ── 1 · La papelera de una prueba en «Mi trabajo» ──
  let b = base(), m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  const fila = () => m.raiz.busca(n => n.getAttribute('data-fila-estrategia') === 'e1')
  ok(!!q(m, 'data-borrar-prueba', 1) && fila().textContent.includes('No pasa'), 'Mi trabajo: papelera en la fila con prueba')
  ok(!m.raiz.busca(n => n.getAttribute('data-fila-estrategia') === 'e2').busca(n => n.getAttribute('data-borrar-prueba') != null), 'sin prueba: sin esa papelera')
  D.pulsa(q(m, 'data-borrar-prueba', 1)); await D.espera(5)
  let v = ventana(m, 'borrar-prueba')
  ok(v?.textContent.includes('¿Borrar esta prueba? Desaparece del todo.') && v.textContent.includes(AVISO) && v.textContent.includes('Prueba contra el azar · AAPL · velas diarias') && v.textContent.includes('30/10/2026'), 'la ventana: la pregunta, cuál es y el aviso amarillo')
  D.pulsa(q(m, 'data-boton', 'cancelar-borrar-prueba')); await D.espera(5)
  ok(!ventana(m, 'borrar-prueba') && !b.borrados.length, '«Cancelar»: no borra nada')
  D.pulsa(q(m, 'data-borrar-prueba', 1)); await D.espera(5); D.pulsa(q(m, 'data-boton', 'si-borrar-prueba')); await D.espera(LARGO)
  ok(b.borrados.join() === 'pruebas_azar?id=eq.1' && !ventana(m, 'borrar-prueba'), '«Borrar la prueba»: borra solo esa')
  ok(fila().textContent.includes('Sin probar') && !q(m, 'data-borrar-prueba', 1), 'y la fila vuelve a «Sin probar»')
  m.quita(); await D.espera(5)
  b = base({ falla: 'pruebas_azar?id=' }); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-prueba', 1)); await D.espera(5); D.pulsa(q(m, 'data-boton', 'si-borrar-prueba')); await D.espera(30)
  ok(ventana(m, 'borrar-prueba')?.textContent.includes('No se pudo borrar') && fila().textContent.includes('No pasa'), 'si la base no la borra: lo dice y sigue ahí'); m.quita(); await D.espera(5)

  // ── 2 · El paso 2: sus pruebas anteriores ──
  b = base(); m = D.monta(h(BP, props({ vistaInicial: { azar: { estrategiaId: 'e1' } } })), RDC); await D.espera(LARGO)
  ok(!!q(m, 'data-prueba-azar', 1)?.busca(n => n.getAttribute('data-borrar-prueba') === '1'), 'Pruebas anteriores: papelera en cada fila')
  ok(!(m.raiz.textContent || '').includes('no se podrá borrar'), 'ya no dice que no se puede borrar')
  D.pulsa(q(m, 'data-borrar-prueba', 1)); await D.espera(5); D.pulsa(q(m, 'data-boton', 'si-borrar-prueba')); await D.espera(LARGO)
  ok(b.borrados.join() === 'pruebas_azar?id=eq.1' && !q(m, 'data-prueba-azar', 1) && !!q(m, 'data-sin-pruebas'), 'al borrarla, sale de la lista'); m.quita(); await D.espera(5)

  // ── 3 · Borrar una estrategia ──
  b = base({ pruebas: [prueba(1), prueba(2)] }); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-estrategia', 'e1')); await D.espera(5)
  v = ventana(m, 'borrar-estrategia')
  ok(v?.textContent.includes('¿Borrar la estrategia «Con prueba y plan»?') && v.textContent.includes('2 pruebas contra el azar: se borran con ella') && v.textContent.includes('1 plan: se queda, con su copia guardada') && v.textContent.includes('Mi plan') && v.textContent.includes(AVISO), 'la ventana: sus pruebas se borran, el plan se queda, y el aviso')
  ok(m.raiz.conAtributo('data-se-borra').length === 2 && m.raiz.conAtributo('data-se-queda').length === 1 && !!q(m, 'data-abrir-plan-borrar', 5), 'cada prueba en su línea; el plan con «Abrir el plan»')
  ok(q(m, 'data-boton', 'si-borrar-estrategia').textContent === 'Borrar', 'el botón dice «Borrar»')
  D.pulsa(q(m, 'data-boton', 'cancelar-borrar-estrategia')); await D.espera(5); ok(!b.borrados.length, '«Cancelar»: nada')
  D.pulsa(q(m, 'data-borrar-estrategia', 'e1')); await D.espera(5); D.pulsa(q(m, 'data-abrir-plan-borrar', 5)); await D.espera(LARGO)
  ok(!b.borrados.length && m.raiz.busca(n => n.getAttribute('aria-selected') === 'true')?.getAttribute('data-pestana') === 'g5', '«Abrir el plan»: lo abre y no borra nada'); m.quita(); await D.espera(5)
  b = base({ pruebas: [prueba(1), prueba(2)] }); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-estrategia', 'e1')); await D.espera(5); D.pulsa(q(m, 'data-boton', 'si-borrar-estrategia')); await D.espera(LARGO)
  ok(b.borrados.join(' ') === 'strategies?id=eq.e1 pruebas_azar?estrategia_id=eq.e1' && !b.pruebas.length, 'primero la estrategia, luego sus pruebas')
  ok(b.planes.length === 1 && !b.escritos.length, 'el plan no se toca')
  ok(!m.raiz.busca(n => n.getAttribute('data-fila-estrategia') === 'e1'), 'y la fila desaparece'); m.quita(); await D.espera(5)
  // Sin pruebas ni planes: sin aviso.
  b = base(); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-estrategia', 'e2')); await D.espera(5); v = ventana(m, 'borrar-estrategia')
  ok(!v.textContent.includes(AVISO) && !q(m, 'data-lista-pruebas') && !q(m, 'data-lista-planes'), 'sin pruebas ni planes: sin listas y sin aviso'); m.quita(); await D.espera(5)
  // Sin poder leer sus pruebas: no deja.
  b = base({ sinLeer: true }); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-estrategia', 'e1')); await D.espera(5)
  ok(q(m, 'data-boton', 'si-borrar-estrategia').getAttribute('disabled') != null || D.propsDe(q(m, 'data-boton', 'si-borrar-estrategia')).disabled === true, 'sin poder leer sus pruebas: no deja borrar'); m.quita(); await D.espera(5)
  // Si fallan sus pruebas tras borrarla, lo dice.
  b = base({ falla: 'pruebas_azar?estrategia_id' }); m = D.monta(h(BP, props()), RDC); await D.espera(LARGO)
  D.pulsa(q(m, 'data-borrar-estrategia', 'e1')); await D.espera(5); D.pulsa(q(m, 'data-boton', 'si-borrar-estrategia')); await D.espera(LARGO)
  ok(ventana(m, 'borrar-estrategia')?.textContent.includes('La estrategia se ha borrado, pero sus pruebas no'), 'si sus pruebas no se borran: lo dice'); m.quita(); await D.espera(5)

  // ── 4 · Los planes tras borrar la estrategia: el mismo cálculo ──
  const filaP = planFila(5, 'Mi plan', ests[0])
  const calculados = []
  const calcula = async (plan) => { calculados.push(plan); throw new Error('sin motor en esta prueba') }
  const monta = async (lista) => { b = base({ planes: [filaP], pruebas: [] }); const x = D.monta(h(BPlan, { estrategias: lista, apiFetch: api, planId: 5, deps: { ctx: { url: 'https://falso.invalid', headers: {}, fetch: (...a) => globalThis.fetch(...a) }, calcula } }), RDC); await D.espera(900); return x }
  m = await monta(ests); const conEst = calculados[calculados.length - 1]; m.quita(); await D.espera(5)
  ok(!!conEst, 'el plan se calcula con la estrategia')
  m = await monta([ests[1]]); const sinEst = calculados[calculados.length - 1]
  ok(await Pl.huellaPlan(sinEst) === await Pl.huellaPlan(filaP.plan), 'tras borrar la estrategia, se calcula el plan guardado: la misma huella')
  ok(await Pl.huellaPlan(sinEst) === await Pl.huellaPlan(conEst), 'y es el mismo que antes de borrarla')
  ok(m.raiz.conAtributo('data-ruta', 'estrategia')[0]?.textContent === 'Con prueba y plan (estrategia borrada · copia guardada)', `la ruta: ${m.raiz.conAtributo('data-ruta', 'estrategia')[0]?.textContent}`)
  ok(m.raiz.todos(n => n.nodeName === 'OPTION').some(n => n.textContent === 'Con prueba y plan (estrategia borrada · copia guardada)'), 'el desplegable dice lo mismo')
  ok(!q(m, 'data-boton', 'guardar-cambios') && !q(m, 'data-boton', 'descartar'), 'sin cambios por guardar')
  ok(!q(m, 'data-boton', 'ver-prueba') && !q(m, 'data-boton', 'paso2'), 'sin «Probarla ahora» ni «Volver al paso 2»')
  ok(!m.raiz.busca(n => n.nodeName === 'BUTTON' && n.getAttribute('data-paso') === '2'), 'el paso 2 no se pulsa')
  ok(b.escritos.length === 0, 'mirarlo no escribe nada'); m.quita(); await D.espera(5)

  console.log(fallos ? `borrar: ${fallos} fallos` : 'borrar: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
