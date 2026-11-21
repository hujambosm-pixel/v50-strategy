// scripts/alertas/comprobador.js — el COMPROBADOR de las alertas (docs/builder.md §217; boceto bocetos/alertas-desde-cero.html).
//
//   node scripts/alertas/comprobador.js                 una pasada: mira todas las alertas encendidas y avisa de las que saltan
//   node scripts/alertas/comprobador.js --ensayo        lo mismo sin escribir en la base ni avisar (dice qué haría)
//   opciones de prueba: --usuario <uuid> (solo las de ese usuario) · --precios <archivo.json> (precios inventados en vez de Yahoo)
//                       --ahora <ISO> (la hora de la pasada) · --sin-aviso (sin notificación de Windows) · --sin-registro
//
// La lanza sola la tarea de Windows «TradingSimulator - alertas» (instalaTarea.ps1) cada 15 min de lunes a viernes, sin ventana
// (comprobador.vbs). Si la base local no está encendida, no hace nada (las alertas viven en la base).
//
// QUÉ HACE EN CADA PASADA:
//   1) lee las alertas encendidas (public.alertas, con la clave de servicio LOCAL de .env.local);
//   2) pide a Yahoo, una vez por símbolo, las velas diarias (la de hoy, con el máximo y el mínimo HASTA AHORA) y el precio de ahora;
//      con «Condición del catálogo», toda la historia (range=max) de cada símbolo que miran sus filas;
//   3) el motor (lib/alertas/motor.js) dice si cada una se cumple y qué cambia; la vela está «cerrada» si su sesión ya terminó;
//   4) si salta: apunta el salto en public.alertas_saltos, cambia la alerta (apagada / desarmada / último salto) y te avisa con una
//      notificación de Windows (como mucho 3; si saltan más, una que lo resume).
// Registro: Documentos\TradingSimulator_alertas\_registro.txt (las 2.000 últimas líneas).
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { preparaEsm, RAIZ } = require('../guardian/cargaEsm')

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const ENSAYO = process.argv.includes('--ensayo'), SIN_AVISO = ENSAYO || process.argv.includes('--sin-aviso')
const SIN_REGISTRO = ENSAYO || process.argv.includes('--sin-registro')
const USUARIO = arg('--usuario'), PRECIOS = arg('--precios'), AHORA = arg('--ahora') ? new Date(arg('--ahora')) : new Date()
const CARPETA = path.join(os.homedir(), 'Documents', 'TradingSimulator_alertas')
const MAX_AVISOS = 3, A_LA_VEZ = 4

function leeEnv() {
  const t = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
  return Object.fromEntries(t.split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
}
const lineas = []
const apunta = (t) => { const l = `${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${t}`; lineas.push(l); console.log(l) }
function guardaRegistro() {
  try {
    fs.mkdirSync(CARPETA, { recursive: true })
    const f = path.join(CARPETA, '_registro.txt')
    const antes = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean) : []
    fs.writeFileSync(f, [...antes, ...lineas].slice(-2000).join('\r\n') + '\r\n')
  } catch (e) { console.error('no pude guardar el registro:', e.message) }
}

// ── La base (REST de Supabase local con la clave de servicio) ──
function base(env) {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), clave = env.SUPABASE_SERVICE_ROLE_KEY
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url + '/')) throw new Error('el comprobador solo trabaja con la base LOCAL (NEXT_PUBLIC_SUPABASE_URL no es 127.0.0.1)')
  if (!clave) throw new Error('falta SUPABASE_SERVICE_ROLE_KEY en .env.local')
  return async (ruta, { metodo = 'GET', cuerpo } = {}) => {
    const r = await fetch(`${url}/rest/v1/${ruta}`, { method: metodo, signal: AbortSignal.timeout(10000),
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined })
    if (!r.ok) throw new Error(`base ${metodo} ${ruta.split('?')[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    return metodo === 'GET' ? r.json() : null
  }
}

// ── Yahoo: lo que se sabe hoy de un símbolo ──
// → { zona, fecha, cerrada, dia: { abre, maximo, minimo, ahora }, cierreAyer, velas: [{ date, open, high, low, close, volume }] }
async function deYahoo(simbolo, conHistoria, M) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=${conHistoria ? 'max' : '5d'}`
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`)
  const j = (await r.json())?.chart?.result?.[0]
  if (!j?.timestamp?.length) throw new Error('Yahoo no da velas')
  return deRespuesta(j, M)
}
function deRespuesta(j, M) {
  const m = j.meta || {}, zona = m.exchangeTimezoneName || 'America/New_York', q = j.indicators?.quote?.[0] || {}
  const velas = []
  j.timestamp.forEach((t, k) => {
    const v = { date: M.diaNY(t * 1000, zona), open: q.open?.[k], high: q.high?.[k], low: q.low?.[k], close: q.close?.[k], volume: q.volume?.[k] ?? 0 }
    if ([v.open, v.high, v.low, v.close].every(x => typeof x === 'number' && Number.isFinite(x))) {
      if (velas.length && velas[velas.length - 1].date === v.date) velas[velas.length - 1] = v; else velas.push(v)
    }
  })
  if (!velas.length) throw new Error('Yahoo no da velas con precio')
  const hoy = velas[velas.length - 1], reg = m.currentTradingPeriod?.regular
  // Abierta solo si la última vela es la de la sesión de ahora y esa sesión aún no ha terminado.
  const abierta = !!reg && hoy.date === M.diaNY(reg.start * 1000, zona) && AHORA.getTime() / 1000 < reg.end
  const ahora = !abierta ? hoy.close : (typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : hoy.close)
  return { zona, fecha: hoy.date, cerrada: !abierta, dia: { abre: hoy.open, maximo: Math.max(hoy.high, ahora), minimo: Math.min(hoy.low, ahora), ahora },
    cierreAyer: velas.length > 1 ? velas[velas.length - 2].close : null, velas }
}

// ── La notificación de Windows (notificacion.ps1; los textos van en base64 para que no se pierdan los acentos) ──
function avisa(avisos) {
  if (SIN_AVISO || !avisos.length) return Promise.resolve()
  const lista = avisos.length > MAX_AVISOS
    ? [{ titulo: `Han saltado ${avisos.length} alertas`, texto: avisos.slice(0, 4).map(a => a.titulo).join(' · ') + (avisos.length > 4 ? ' …' : '') }]
    : avisos
  const datos = Buffer.from(JSON.stringify(lista), 'utf8').toString('base64')
  return new Promise((res) => {
    const h = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'notificacion.ps1'), '-Datos', datos], { windowsHide: true })
    let err = ''
    h.stderr.on('data', d => { err += d })
    h.on('close', (c) => { if (c) apunta(`⚠ la notificación falló (${c}): ${err.trim().slice(0, 200)}`); res() })
    h.on('error', (e) => { apunta(`⚠ la notificación falló: ${e.message}`); res() })
  })
}

async function enTandas(xs, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const x = xs[i++]; await fn(x) } })) }

;(async () => {
  let codigo = 0
  try {
    await preparaEsm()
    const M = require(path.join(RAIZ, 'lib', 'alertas', 'motor.js'))
    const env = leeEnv(), db = base(env)
    let alertas
    try { alertas = await db(`alertas?activa=eq.true&select=*${USUARIO ? `&user_id=eq.${encodeURIComponent(USUARIO)}` : ''}&order=creada`) }
    catch (e) { if (/fetch failed|ECONNREFUSED|timeout|aborted/i.test(e.message + (e.cause?.message || ''))) { console.log('La base local está apagada: nada que mirar.'); return } throw e }
    if (!alertas.length) { apunta('Sin alertas encendidas.'); return }
    const listas = alertas.filter(a => M.TIPOS_LISTOS.includes(a.tipo) && !M.validaAlerta(a).length)
    for (const a of alertas) if (!listas.includes(a)) apunta(`· ${a.simbolo} (${a.tipo}): no se mira (${M.validaAlerta(a).join(' ') || 'tipo aún no disponible'})`)
    // Los símbolos: los de las alertas y los que miran las condiciones (con toda su historia).
    const conHistoria = new Set(listas.filter(a => a.tipo === 'condicion').flatMap(a => [a.simbolo, ...M.filasDe(a).map(f => f.quien)]))
    const simbolos = [...new Set([...listas.map(a => a.simbolo), ...conHistoria])]
    const datos = {}, fallos = {}
    if (PRECIOS) {
      const inv = JSON.parse(fs.readFileSync(PRECIOS, 'utf8'))
      for (const s of simbolos) { if (inv[s]) datos[s] = inv[s]; else fallos[s] = 'no está en los precios inventados' }
    } else {
      await enTandas(simbolos, A_LA_VEZ, async (s) => { try { datos[s] = await deYahoo(s, conHistoria.has(s), M) } catch (e) { fallos[s] = e.message } })
    }
    for (const [s, e] of Object.entries(fallos)) apunta(`⚠ ${s}: sin precios (${e})`)
    const velasDe = (s) => datos[s]?.velas || null
    const avisos = []
    let saltos = 0
    for (const a of listas) {
      const d = datos[a.simbolo]
      if (!d) continue
      const ctx = { fecha: d.fecha, zona: d.zona, dia: d.dia, cerrada: d.cerrada, cierreAyer: d.cierreAyer, velasDe }
      const p = M.pasada(a, ctx, AHORA)
      const frase = p.salta ? M.fraseSalto(a, p.resultado, ctx) : null
      if (p.salta) {
        saltos++
        apunta(`★ SALTA ${frase.titulo} — ${frase.texto}`)
        if (!ENSAYO) {
          await db('alertas_saltos', { metodo: 'POST', cuerpo: { alerta_id: a.id, user_id: a.user_id, simbolo: a.simbolo, cuando: AHORA.toISOString(), precio: p.precio ?? null,
            detalle: { tipo: a.tipo, regla: a.regla, fecha: d.fecha, cerrada: d.cerrada, dia: d.dia, cierreAyer: d.cierreAyer, titulo: frase.titulo, texto: frase.texto } } })
        }
        avisos.push(frase)
      }
      if (Object.keys(p.cambios).length) {
        if (!p.salta) apunta(`· ${a.simbolo} (${a.tipo}): ${p.motivo === 'caducada' ? 'caducada, se apaga' : 'se vuelve a armar'}`)
        if (!ENSAYO) await db(`alertas?id=eq.${a.id}`, { metodo: 'PATCH', cuerpo: p.cambios })
      }
    }
    await avisa(avisos)
    apunta(`Pasada${ENSAYO ? ' (ensayo)' : ''}: ${listas.length} alertas, ${Object.keys(datos).length} símbolos con precio, ${saltos} saltan.`)
  } catch (e) {
    apunta(`✗ ERROR: ${e.message}`)
    codigo = 1
  } finally {
    if (!SIN_REGISTRO) guardaRegistro()
  }
  process.exitCode = codigo
})()
