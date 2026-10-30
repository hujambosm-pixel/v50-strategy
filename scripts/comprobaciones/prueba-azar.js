// scripts/comprobaciones/prueba-azar.js — vigila lib/pruebaAzar.js (paso 2 del Builder, «Probarla contra el azar»; docs/builder.md, §44).
// Solo velas INVENTADAS; no escribe en la base: las tablas pruebas_azar y pruebas_azar_resultados se comprueban leyendo la
// definición de sus políticas y permisos (solo lectura, con scripts/guardian/lecturaBd.js: hace falta «supabase login»).
//
// Uso:   node scripts/comprobaciones/prueba-azar.js           (la versión corta de comunes.sh: menos de un minuto)
//
// 1 · A mano. 300 velas planas a 100 (calentamiento) y dos tramos iguales de 9 velas (el segundo, × 0,86), una cada 30 días.
//     Regla: compra a la apertura siguiente cuando el cierre supera el máximo de las 2 velas anteriores; stop fijo del 8 %.
//       tramo: p0 100 · p1 cierra a 101,5 (> 100: señal) · p2 abre a 102 (compra; stop 93,84) y cierra a 103 · p3 abre a 103 y
//       baja a 90 → vende a 93,84 · p4, p5 sin señal (92,8 < 103) · p6 cierra a 93,5 (> 93: señal) · p7 abre a 94 (compra) y cierra
//       a 95,5 · p8 cierra a 96,5 (sigue abierta: se valora a ese cierre).
//     → 2 operaciones; crecimiento 0,92 × 96,5 / 94; en 240 días, CAGR = (0,92 × 96,5 / 94)^(365,25 / 240) − 1 = −8,34 %; caída
//       máxima 1 − 0,92 / (103 / 102) = 8,89 % (el máximo, al cierre de p2); velas sin posición 9 − 2 (p3 y p8) = 7 → tasa 2 / 7.
//     Entre los tramos, una vela que abre a 96,5 y baja a 85 cierra la abierta (stop 86,48) y dos planas a 86: el segundo tramo
//     empieza sin posición y da exactamente lo mismo.
// 2 · fiabilidad() mercado a mercado (con `primero`) suma lo mismo que una llamada con todos.
// 3 · «Sin veredicto» con aprobados falsos ≥ 9 % en un periodo, aunque el percentil sea 99 en los dos.
// 4 · Determinismo: la misma foto y la misma semilla, dos veces, dan un resultado idéntico byte a byte (diarias y semanales, en un
//     paseo aleatorio inventado), con la huella de todo el resultado guardada (HUELLA).
// 5 · El acceso a la base con un fetch simulado (lo que se manda y «si ya existe, no hace nada»).
// 6 · Las políticas de las dos tablas: RLS activa, solo SELECT e INSERT del dueño, sin UPDATE ni DELETE.
const path = require('path')
const C0 = require('./cargador')
const HUELLA = '03313d2c'
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, e = 1e-9) => Math.abs(a - b) <= e
;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const PA = require(path.join(C0.RAIZ, 'lib/pruebaAzar.js'))
  const AR = require(path.join(C0.RAIZ, 'lib/azarReglas.js'))
  const { generador, semillaDe } = require(path.join(C0.RAIZ, 'lib/azar.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))
  const { huella } = require(path.join(C0.RAIZ, 'lib/lotesLab.js'))
  const t0 = Date.now()

  // ── 1 · A mano ──
  const defMano = { tipo: 'editor', formato: 1, motor: 1, nombre: 'a mano', parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } },
    stops: [{ id: 'porcentaje1', tipo: 'porcentaje', motivo: 'stop', pct: 8, historialAlEntrar: true }], salidas: [] }
  ok(!validaDefinicion(defMano).length, `la regla a mano es válida ${validaDefinicion(defMano).join(' ')}`)
  const tramo = [[100, 100, 100, 100], [100, 102, 100, 101.5], [102, 104, 101, 103], [103, 103, 90, 91], [91, 92, 90, 91.5], [91.5, 93, 91, 92.8], [92.8, 94, 92, 93.5], [94, 96, 93.5, 95.5], [95.5, 97, 95, 96.5]]
  const filas = [...Array(300).fill([100, 100, 100, 100]), ...tramo, [96.5, 96.5, 85, 86], [86, 86, 86, 86], [86, 86, 86, 86], ...tramo.map(x => x.map(y => y * 0.86))]
  const d0 = Date.UTC(1990, 0, 1), velasMano = filas.map(([open, high, low, close], i) => ({ date: new Date(d0 + i * 30 * 864e5).toISOString().slice(0, 10), open, high, low, close, volume: 1000 }))
  const A = [velasMano[300].date, velasMano[308].date], B = [velasMano[312].date, velasMano[320].date]
  const fila = { id: '00000000-0000-0000-0000-000000000001', name: 'a mano', definition: defMano, params: '{}' }
  const pMano = { ...(await PA.nuevaPrueba({ fila, valor: 'MANO', velas: 'diarias', semilla: 7 })), periodos: [A, B] }
  const rMano = await PA.ejecutarPrueba(pMano, { MANO: velasMano })
  const cagrMano = (Math.pow(0.92 * 96.5 / 94, 365.25 / 240) - 1) * 100, caidaMano = (1 - 0.92 / (103 / 102)) * 100
  for (const [k, p] of rMano.periodos.entries()) {
    ok(p.operaciones === 2 && cerca(p.tasa, 2 / 7) && cerca(p.cagr, cagrMano) && cerca(p.caida, caidaMano),
      `a mano, tramo ${k + 1}: ${p.operaciones} operaciones, tasa ${p.tasa.toFixed(4)} (2/7), CAGR ${p.cagr.toFixed(4)} % (${cagrMano.toFixed(4)}), caída ${p.caida.toFixed(4)} % (${caidaMano.toFixed(4)})`)
    ok(p.velas === 9 && p.calentamiento > 0 && p.cagrCopias.length === 1000 && p.fiabilidad.mercados === 200, `a mano, tramo ${k + 1}: 9 velas, ${p.calentamiento} de calentamiento, 1.000 copias, 200 mercados`)
  }
  ok(rMano.pocasOperaciones === true, 'a mano: aviso de pocas operaciones (2 < 30)')
  const pp = PA.preparaPeriodo({ def: defMano, valores: {}, velasValor: velasMano, desde: A[0], hasta: A[1], intervalo: 'diario' })
  ok(pp.operaciones === 2 && pp.bars[pp.bars.length - 1].date === A[1], 'a mano: preparaPeriodo no mira más allá del periodo y cuenta 2 operaciones')

  // ── 2 · fiabilidad() mercado a mercado = de una vez ──
  const inventa = (desde, hasta, semilla) => {
    const rnd = generador(semillaDe(semilla)), out = []
    let c = 100, vol = 0.012
    for (let d = Date.parse(desde); d <= Date.parse(hasta); d += 864e5) {
      if ([0, 6].includes(new Date(d).getUTCDay())) continue
      vol = Math.min(0.04, Math.max(0.006, vol * (0.9 + 0.2 * rnd())))
      const o = c * (1 + vol * (rnd() - 0.5) * 0.5), cl = o * (1 + vol * (rnd() - 0.47) * 2.5)
      out.push({ date: new Date(d).toISOString().slice(0, 10), open: o, high: Math.max(o, cl) * (1 + vol * rnd()), low: Math.min(o, cl) * (1 - vol * rnd()), close: cl, volume: 1000 })
      c = cl
    }
    return out
  }
  const atrCompra = { id: 'atrCompra1', tipo: 'atrCompra', motivo: 'stop', k: 2, periodo: 14, historialAlEntrar: true }
  const minimo10 = { id: 'minimoMovil1', tipo: 'minimoMovil', motivo: 'stop_minimo', n: 10, historialAlEntrar: true }
  const defS4 = { tipo: 'editor', formato: 1, motor: 1, nombre: 'S4', parametros: { version: 1, lista: [] }, entrada: { senal: { c: 'nuevoMaximo', p: { n: 20 } }, orden: { tipo: 'apertura' } },
    stops: [atrCompra, minimo10], stopsModo: 'masAlto', salidas: [] }
  const paseo = inventa('2014-01-01', '2026-01-31', 'pruebaAzar|velas')
  {
    const op = { copias: 200, semilla: 'uno a uno', desde: '2016-01-01', hasta: '2020-12-31' }, todos = AR.fiabilidad(paseo, defS4, { ...op, mercados: 20 })
    let a = 0, s = 0
    for (let m = 0; m < 20; m++) { const f = AR.fiabilidad(paseo, defS4, { ...op, mercados: 1, primero: m }); a += f.aprobados; s += f.sinOperaciones }
    ok(a === todos.aprobados && s === todos.sinOperaciones, `fiabilidad uno a uno = de una vez: ${a} y ${todos.aprobados} aprobados falsos de 20`)
  }

  // ── 3 · «Sin veredicto» ──
  const p99 = [{ percentil: 99, operaciones: 50 }, { percentil: 99, operaciones: 50 }]
  ok(AR.veredicto({ aprobadosFalsos: [2, 9], periodos: p99 }).veredicto === 'sinVeredicto', 'aprobados falsos 9 % en el segundo periodo y percentil 99 en los dos → Sin veredicto')
  ok(AR.veredicto({ aprobadosFalsos: [12.5, 3], periodos: p99 }).veredicto === 'sinVeredicto', 'aprobados falsos 12,5 % en el primero → Sin veredicto')
  ok(AR.veredicto({ aprobadosFalsos: [8.5, 8.5], periodos: p99 }).veredicto === 'pasa', 'con 8,5 % en los dos → Pasa')
  // Y por ejecutarPrueba: el mismo resultado con la fiabilidad de un periodo cambiada a 9 % da «Sin veredicto».
  {
    const ps = rMano.periodos.map((p, k) => ({ percentil: 99, operaciones: p.operaciones }))
    ok(AR.veredicto({ aprobadosFalsos: [rMano.periodos[0].aprobadosFalsos, 9], periodos: ps }).veredicto === 'sinVeredicto', 'a mano con el 9 % en un periodo → Sin veredicto')
  }

  // ── 4 · Determinismo ──
  const filaS4 = { id: '00000000-0000-0000-0000-000000000004', name: 'S4', definition: defS4, params: { intervalo: 'diario' } }
  const res = []
  for (const velas of ['diarias', 'semanales']) {
    const prueba = await PA.nuevaPrueba({ fila: filaS4, valor: 'PASEO', velas, semilla: 20261030 })
    const etapas = [], t = Date.now(), r1 = JSON.stringify(await PA.ejecutarPrueba(prueba, { PASEO: paseo }, (p) => { if (etapas[etapas.length - 1] !== p.etapa) etapas.push(p.etapa) })), t1 = Date.now()
    const r2 = JSON.stringify(await PA.ejecutarPrueba(JSON.parse(JSON.stringify(prueba)), { PASEO: paseo.map(x => ({ ...x })) }))
    const r = JSON.parse(r1)
    ok(r1 === r2, `${velas}: dos veces con la misma foto y semilla, idéntico byte a byte (${r1.length} bytes; ${((t1 - t) / 1000).toFixed(1)} s cada una)`)
    console.log(`     ${velas}: ${r.periodos.map(p => `${p.nombre} ${p.operaciones} op., CAGR ${p.cagr.toFixed(2)} % / mediana ${p.mediana.toFixed(2)} %, gana al ${p.percentil.toFixed(1)} %, aprobados falsos ${p.aprobadosFalsos.toFixed(1)} %`).join(' · ')} → ${r.texto}`)
    ok(etapas.join(',') === 'fiabilidad,comparar,veredicto', `${velas}: etapas en orden: ${etapas.join(', ')}`)
    if (velas === 'diarias') ok(JSON.stringify(await PA.ejecutarPrueba({ ...prueba, semilla: prueba.semilla + 1 }, { PASEO: paseo })) !== r1, `${velas}: con otra semilla, otro resultado`)
    res.push(r1)
  }
  {
    const prueba = await PA.nuevaPrueba({ fila: filaS4, valor: 'PASEO', velas: 'diarias', semilla: 1 })
    let error = null; try { await PA.ejecutarPrueba({ ...prueba, regla: { ...prueba.regla, gana: 90 } }, { PASEO: paseo }) } catch (e) { error = e.message }
    ok(!!error, 'una prueba con otra regla guardada no se calcula con esta versión')
  }
  const h = (await huella(res)).slice(0, 8)
  ok(h === HUELLA, `huella de los resultados: ${h}${h === HUELLA ? '' : ` (guardada: ${HUELLA})`}`)
  {
    const c = PA.comprobarPrecios(PA.fotoDe(filaS4), { PASEO: paseo }, 'PASEO', 'diarias'), corto = PA.comprobarPrecios(PA.fotoDe(filaS4), { PASEO: paseo.filter(x => x.date >= '2015-12-01' && x.date <= '2025-06-30') }, 'PASEO', 'diarias')
    ok(c.ok && c.operaciones.length === 2 && !c.faltan.length, `comprobarPrecios: precios completos, ${c.operaciones.join(' y ')} operaciones`)
    ok(!corto.ok && corto.faltan.length === 2, `comprobarPrecios: sin calentamiento y sin el final → ${corto.faltan.map(x => x.tramo).join(' · ')}`)
  }

  // ── 5 · El acceso a la base, con un fetch simulado ──
  {
    const llamadas = []
    const responde = (status, cuerpo) => ({ ok: status < 300, status, json: async () => cuerpo })
    let modo = 'nuevo'
    const fetchFalso = async (url, op = {}) => {
      llamadas.push({ url, metodo: op.method || 'GET', prefer: op.headers?.Prefer, cuerpo: op.body ? JSON.parse(op.body) : null })
      if (url.includes('/pruebas_azar_resultados?on_conflict')) return modo === 'nuevo' ? responde(201, [{ id: 9, prueba_id: 5 }]) : modo === 'vacio' ? responde(201, []) : responde(409, {})
      if (url.includes('/pruebas_azar_resultados?select')) return responde(200, [{ id: 3, prueba_id: 5, resultado: { veredicto: 'pasa' } }])
      if (url.includes('/pruebas_azar?select')) return responde(200, [{ id: 5, estrategia_id: 'x', res: { id: 3, veredicto: 'pasa', texto: 'Pasa' } }, { id: 4, estrategia_id: 'x', res: null }])
      return responde(201, [{ id: 5, ...JSON.parse(op.body) }])
    }
    const ctx = { url: 'https://falso', headers: { apikey: 'k' }, fetch: fetchFalso }
    const conf = await PA.confirmarPrueba(ctx, { fila: filaS4, valor: 'AAPL', velas: 'diarias', version: 'V0' })
    const c0 = llamadas[0]
    ok(c0.metodo === 'POST' && c0.url === 'https://falso/rest/v1/pruebas_azar' && conf.id === 5 && /^[0-9a-f]{64}$/.test(c0.cuerpo.estrategia_huella) && Number.isInteger(c0.cuerpo.semilla)
      && JSON.stringify(c0.cuerpo.regla) === JSON.stringify(AR.REGLA_AZAR_REGLAS) && c0.cuerpo.estrategia_foto.definition.nombre === 'S4', 'confirmarPrueba: inserta la foto, su huella, la regla y una semilla, y devuelve la fila')
    ok(c0.cuerpo.estrategia_huella === await PA.huellaEstrategia(filaS4), 'la huella guardada es la de la estrategia (huellaEstrategia)')
    const g1 = await PA.guardarResultado(ctx, 5, { veredicto: 'pasa' }, 'V0')
    ok(g1.nuevo && llamadas[1].prefer.includes('resolution=ignore-duplicates') && llamadas[1].cuerpo.prueba_id === 5, 'guardarResultado: inserta con «si ya existe, no hace nada»')
    modo = 'vacio'; const g2 = await PA.guardarResultado(ctx, 5, { veredicto: 'noPasa' })
    modo = 'conflicto'; const g3 = await PA.guardarResultado(ctx, 5, { veredicto: 'noPasa' })
    ok(!g2.nuevo && !g3.nuevo && g2.resultado.veredicto === 'pasa' && g3.resultado.veredicto === 'pasa', 'guardarResultado: si ya había uno, devuelve el que había y no lo cambia')
    const lista = await PA.listarPruebas(ctx, 'x')
    ok(lista.length === 2 && lista[0].resultado.veredicto === 'pasa' && lista[1].resultado === null && llamadas[llamadas.length - 1].url.includes('estrategia_id=eq.x'), 'listarPruebas: las de la estrategia, con su veredicto o sin terminar')
    ok(llamadas.every(l => l.metodo === 'GET' || l.metodo === 'POST'), 'solo lee e inserta (ni PATCH ni DELETE)')
  }

  // ── 6 · Las políticas de las tablas (solo lectura) ──
  try {
    const { consultaSoloLectura } = require('../guardian/lecturaBd')
    const pol = await consultaSoloLectura("SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check FROM pg_policies WHERE tablename IN ('pruebas_azar', 'pruebas_azar_resultados') ORDER BY 1, 2;")
    const gr = await consultaSoloLectura("SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS p FROM information_schema.role_table_grants WHERE table_name IN ('pruebas_azar', 'pruebas_azar_resultados') AND grantee IN ('anon', 'authenticated') GROUP BY 1, 2 ORDER BY 1, 2;")
    const rls = await consultaSoloLectura("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('pruebas_azar', 'pruebas_azar_resultados') AND relkind = 'r';")
    for (const t of ['pruebas_azar', 'pruebas_azar_resultados']) {
      const ps = pol.filter(p => p.tablename === t)
      ok(rls.some(r => r.relname === t && r.relrowsecurity === true), `${t}: RLS activa`)
      ok(ps.map(p => p.cmd).sort().join(',') === 'INSERT,SELECT' && ps.every(p => p.roles === '{authenticated}' && String(p.qual || p.with_check).includes('auth.uid() = user_id')), `${t}: solo dos políticas, SELECT e INSERT del dueño (${ps.map(p => p.cmd).join(', ')})`)
      ok(gr.filter(g => g.table_name === t).map(g => `${g.grantee}:${g.p}`).join(' ') === 'authenticated:INSERT,SELECT', `${t}: permisos ${gr.filter(g => g.table_name === t).map(g => `${g.grantee}: ${g.p}`).join(' · ')} (sin UPDATE ni DELETE; anon, nada)`)
    }
    ok(pol.some(p => p.tablename === 'pruebas_azar_resultados' && p.cmd === 'INSERT' && /EXISTS/.test(p.with_check) && /pruebas_azar p/.test(p.with_check)), 'pruebas_azar_resultados: solo se añade un resultado a una prueba propia')
  } catch (e) { ok(false, `no se pudieron leer las políticas: ${e.message}`) }

  console.log(`${fallos ? '✗' : '✓'} prueba del azar (lib/pruebaAzar.js): ${fallos ? `${fallos} fallos` : 'todo bien'} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
