// scripts/comprobaciones/bateria.js — la batería de V9.949 (52 casos: 13 configuraciones × listas V50 y Degiro × diario y
// semanal): respuestas de /api/multibacktest de la versión anterior (VIEJO: una copia del código, la hace comunes.sh) frente al
// árbol de trabajo, byte a byte; y, en cada caso que admite la prueba contra el azar, la respuesta con conCandidatos: true. Sin
// universo dinámico todo tiene que ser idéntico. Datos: las fotos de datos/ (o COMPROBACIONES_DATOS); estrategias: backups/.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const path = require('path')
const { prepara, registra, RAIZ } = require('./cargador')
const E = require('./entorno')
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const VIEJO = path.resolve(process.env.VIEJO), NUEVO = RAIZ
let spExtra = 0
const out = (...a) => process.stdout.write(a.join(' ') + '\n')
;(async () => {
  await prepara(); registra(VIEJO); registra(NUEVO)
  const HV = require(VIEJO + '/pages/api/multibacktest.js').default, HN = require(NUEVO + '/pages/api/multibacktest.js').default
  const v50 = E.FILAS.find(s => s.name === '1 V50 EMA10/11'), e23 = E.FILAS.find(s => s.name === '23 EMA20 breakouts')
  const COM = { compra: 0.36, venta: 0, porcentaje: 0 }, DESDE = '2016-01-01', HASTA = '2026-01-01'
  const FILTRO = [{ tipo: 'rsi', ambito: 'mercado', activo: true, params: { ticker: '^GSPC', periodo: 14, min: 40, max: 100, intervalo: 'semanal' } }]
  const rs = (maxPosiciones, criterioUso) => ({ maxPosiciones, prioridad: 'fuerza_relativa', criterioUso, rsWindow: 63, rsGateThr: 0, momentumN: 20 })
  const CASOS = [
    ['concentrado · fuerza relativa · Desempate · 4', 'concentrado', rs(4, 'desempate')],
    ['concentrado · fuerza relativa · Desempate · 5', 'concentrado', rs(5, 'desempate')],
    ['concentrado · fuerza relativa · Filtro · 4', 'concentrado', rs(4, 'filtro')],
    ['concentrado · fuerza relativa · Filtro · 5', 'concentrado', rs(5, 'filtro')],
    ['concentrado · momentum · 5', 'concentrado', { maxPosiciones: 5, prioridad: 'momentum', criterioUso: 'desempate', momentumN: 20 }],
    ['concentrado · alfabético · 5', 'concentrado', { maxPosiciones: 5, prioridad: 'alfabetico', criterioUso: 'desempate' }],
    ['concentrado · fuerza relativa · Desempate · 5 · sin comisiones', 'concentrado', rs(5, 'desempate'), { comisiones: null }],
    ['compartido', 'compartido', {}],
    ['slots', 'slots', {}],
    ['concentrado · fuerza relativa · 5 · con filtro de mercado (RSI semanal del S&P 500)', 'concentrado', rs(5, 'desempate'), { filtros: FILTRO }],
    ['compartido · con filtro de mercado', 'compartido', {}, { filtros: FILTRO }],
    ['multicartera (1 V50 + 23) · concentrado · fuerza relativa · 5', 'concentrado', rs(5, 'desempate'), { multi: true }],
    ['multicartera (1 V50 + 23) · compartido', 'compartido', {}, { multi: true }],
  ]
  const ordenaOrigen = (txt) => { try { const o = JSON.parse(txt); if (o.origenPrecios) o.origenPrecios = Object.fromEntries(Object.entries(o.origenPrecios).sort(([a], [b]) => a.localeCompare(b))); return JSON.stringify(o) } catch (_) { return txt } }
  let iguales = 0, total = 0, candIguales = 0, candTotal = 0, byteAByte = 0
  for (const [lista, foto] of [['V50', require(path.join(E.DATOS, 'foto_v50.json'))], ['Degiro', require(path.join(E.DATOS, 'foto_degiro.json'))]]) {
    E.estado.foto = foto; E.estado.enCurso = false
    for (const s of Object.keys(foto)) E.llenaCache(s, { desde: '2006-01-01' })
    const symbols = Object.keys(foto).filter(s => s !== '^GSPC')
    for (const iv of ['diario', 'semanal']) {
      for (const [nombre, modo, sizeRules, extra = {}] of CASOS) {
        const cfg = { capitalIni: 10000, years: 10, fromDate: DESDE, toDate: HASTA, emaR: 10, emaL: 11, sizeRules }
        const body = extra.multi
          ? { portfolioMode: true, strategies: [{ id: v50.id, name: v50.name, symbols }, { id: e23.id, name: e23.name, symbols }], cfg, modoAsig: modo, sizeRules, intervalo: iv, comisiones: COM, filtros: [] }
          : { symbols, strategyId: v50.id, cfg, modoAsig: modo, sizeRules, intervalo: iv, comisiones: 'comisiones' in extra ? extra.comisiones : COM, filtros: extra.filtros || [] }
        const a = await E.llama(HV, body), b = await E.llama(HN, body)
        total++
        const igual = a.cuerpo === b.cuerpo
        // V9.990 (BLOQUE C): la curva del S&P 500 gana el pico y el valle de su caída; con SIN_SP se quitan esos puntos nuevos (los
        // de la versión anterior tienen que seguir todos, con el mismo valor) y el resto tiene que ser idéntico byte a byte.
        const sinSp = (x, y) => { const ja = JSON.parse(x), jb = JSON.parse(y), quita = (oa, ob) => { if (!oa || !ob || typeof oa !== 'object') return; for (const k of Object.keys(ob)) { if (k === 'sp500BHCurve' && Array.isArray(oa[k]) && Array.isArray(ob[k])) { const vs = new Map(oa[k].map(p => [p.date, JSON.stringify(p)])); const nuevos = ob[k].filter(p => !vs.has(p.date)); spExtra += nuevos.length; ob[k] = ob[k].filter(p => vs.has(p.date)) } else quita(oa[k], ob[k]) } }; quita(ja, jb); return JSON.stringify(ja) === JSON.stringify(jb) }
        const igualNorm = igual || (a.status === 200 && b.status === 200 && (ordenaOrigen(a.cuerpo) === ordenaOrigen(b.cuerpo) || (process.env.SIN_SP && sinSp(a.cuerpo, b.cuerpo))))
        if (igualNorm) iguales++; if (igual) byteAByte++
        let cand = ''
        if (!extra.multi) {
          const ca = await E.llama(HV, { ...body, conCandidatos: true }), cb = await E.llama(HN, { ...body, conCandidatos: true })
          candTotal++; if (ca.cuerpo === cb.cuerpo) candIguales++
          cand = ` · conCandidatos ${ca.cuerpo === cb.cuerpo ? 'idéntica' : '¡DISTINTA!'} (${(cb.cuerpo.length / 1e6).toFixed(2)} MB)`
        }
        out(`${igualNorm ? '✓' : '✗ DISTINTA'} ${lista} · ${iv} · ${nombre}: HTTP ${a.status}/${b.status} · ${(b.cuerpo.length / 1e6).toFixed(2)} MB · ${igual ? 'byte a byte' : igualNorm ? 'igual salvo el orden de origenPrecios' : 'DIFIERE'}${cand}`)
        if (!igualNorm) { let k = 0; while (a.cuerpo[k] === b.cuerpo[k]) k++; out('   antes «' + a.cuerpo.slice(k - 150, k + 150) + '»\n   ahora «' + b.cuerpo.slice(k - 150, k + 150) + '»') }
      }
    }
  }
  out(`\nRespuestas idénticas: ${iguales} de ${total} (byte a byte ${byteAByte}) · con conCandidatos: ${candIguales} de ${candTotal}`)
  if (process.env.SIN_SP) out(`(puntos nuevos en la curva del S&P 500: ${spExtra})`)
  process.exit(iguales === total && candIguales === candTotal ? 0 : 1)
})().catch(e => { console.error('FALLO', e); process.exit(2) })
