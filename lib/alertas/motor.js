// lib/alertas/motor.js — el MOTOR de las alertas nuevas (docs/builder.md §216; boceto bocetos/alertas-desde-cero.html, aceptado por Sergi el
// 20/11). PURO: no lee la base ni Yahoo. Recibe la alerta (una fila de public.alertas, sql/alertas.sql) y lo que se sabe del día, y dice si
// se cumple y qué cambia en la alerta. Lo usará el comprobador de Windows (parte 3) y la pantalla (partes 4 y 5).
//
// LO QUE SE SABE DEL DÍA (ctx):
//   { fecha: 'AAAA-MM-DD' (la sesión, en la hora de su bolsa), zona (la hora de su bolsa, p. ej. 'Europe/Madrid'; por defecto Nueva York),
//     dia: { abre, maximo, minimo, ahora } (el máximo y el mínimo del día HASTA ESE MOMENTO; ahora = el último precio),
//     cerrada: true solo en la pasada de las 22:15 (la vela del día ya está cerrada: ahora = el cierre),
//     cierreAyer: el cierre de la sesión anterior,
//     velasDe: (símbolo) → velas diarias { date, open, high, low, close, volume } HASTA HOY INCLUIDO (solo «condicion») }
//
// CUÁNDO SALTA CADA TIPO (regla = el jsonb de la alerta):
//   toca        { nivel, sentido }   sube: el máximo del día llega al nivel (≥) · baja: el mínimo baja a él (≤). Se mira en cada pasada.
//                                    Si se crea el día de la sesión (o después: un sábado con la vela del viernes) solo cuenta el precio de
//                                    ahora (el máximo de antes de crearla no vale: si AAPL tocó 232 a las 16:00 y a las 17:00 creas «Toca 231»
//                                    con AAPL a 230, no salta por lo de las 16:00). Igual en «movimiento».
//   cierra      { nivel, lado }      encima: cierre > nivel · debajo: cierre < nivel. Solo con la vela cerrada (22:15).
//   movimiento  { pct, sentido }     desde el cierre de ayer: sube: máximo ≥ ayer × (1 + pct) · baja: mínimo ≤ ayer × (1 − pct) · ambos. Cada pasada.
//   condicion   { filas }            filas del catálogo, como los filtros del plan (quien 'valor' = el símbolo de la alerta). Solo al cierre.
//   estrategia  —                    todavía no (segunda tanda): no se mira.
//   Si un dato falta, «no se sabe» (null): la alerta no cambia.
//
// DESPUÉS DE SALTAR (alerta.despues):
//   una_vez     salta y se apaga (activa = false).
//   una_al_dia  salta como mucho una vez por sesión (mira el día de ultimo_salto, en la hora de Nueva York).
//   cada_vez    salta y se desarma (armada = false); se rearma en cuanto una pasada ve que ya no se cumple; y vuelve a saltar.
//   caduca      'AAAA-MM-DD' incluido: después de ese día se apaga sin saltar.
import { validaFilas, serieFilas } from '../planes/pesos'

export const TIPOS = Object.freeze(['toca', 'cierra', 'movimiento', 'condicion', 'estrategia'])
export const TIPOS_LISTOS = Object.freeze(['toca', 'cierra', 'movimiento', 'condicion'])
export const DESPUES = Object.freeze(['una_vez', 'una_al_dia', 'cada_vez'])
// En qué pasadas se mira: 'sesion' = en todas (cada 15 min y la de las 22:15); 'cierre' = solo en la de las 22:15.
export const CUANDO = Object.freeze({ toca: 'sesion', movimiento: 'sesion', cierra: 'cierre', condicion: 'cierre', estrategia: 'cierre' })

const num = (x) => typeof x === 'number' && Number.isFinite(x)
const positivo = (x) => num(x) && x > 0
const FECHA = /^\d{4}-\d{2}-\d{2}$/

// Las filas con «valor» cambiado por el símbolo de la alerta (así las entiende el motor de las filas del plan).
export const filasDe = (alerta) => (alerta?.regla?.filas || []).map(f => (f?.quien === 'valor' ? { ...f, quien: alerta.simbolo } : f))

export function validaAlerta(a) {
  const e = []
  if (!a || typeof a !== 'object') return ['La alerta no es válida.']
  if (typeof a.simbolo !== 'string' || !/^[A-Z0-9.^=-]{1,30}$/.test(a.simbolo)) e.push('El símbolo no es válido (AAPL, ^GSPC, GC=F, BTC-USD…).')
  if (!TIPOS.includes(a.tipo)) { e.push('El tipo de alerta no es válido.'); return e }
  if (!DESPUES.includes(a.despues ?? 'una_vez')) e.push('«Después de saltar»: una vez, una vez al día o cada vez.')
  if (a.caduca != null && !FECHA.test(a.caduca)) e.push('«Caduca»: una fecha.')
  const r = a.regla || {}
  if (a.tipo === 'toca') {
    if (!positivo(r.nivel)) e.push('El precio tiene que ser mayor que 0.')
    if (!['sube', 'baja'].includes(r.sentido)) e.push('Falta si avisa al subir o al bajar hasta el precio.')
  } else if (a.tipo === 'cierra') {
    if (!positivo(r.nivel)) e.push('El precio tiene que ser mayor que 0.')
    if (!['encima', 'debajo'].includes(r.lado)) e.push('Falta si es al cerrar por encima o por debajo.')
  } else if (a.tipo === 'movimiento') {
    if (!(positivo(r.pct) && r.pct < 100)) e.push('El % tiene que ser mayor que 0 y menor que 100.')
    if (!['sube', 'baja', 'ambos'].includes(r.sentido)) e.push('Falta si avisa al subir, al bajar o en los dos sentidos.')
  } else if (a.tipo === 'condicion') {
    const fs = filasDe(a)
    e.push(...validaFilas(fs, 'La alerta'))
    if (fs.some((f, k) => k > 0 && f?.union !== 'Y')) e.push('La alerta: todas sus condiciones van con «Y».')
  } else e.push('«Señal de una estrategia» llegará más adelante.')
  return e
}

// «Toca el precio» no pregunta: si el nivel está por encima del precio de ahora, avisa al subir; si está por debajo, al bajar.
export const sentidoToca = (nivel, ahora) => (num(nivel) && num(ahora) ? (nivel >= ahora ? 'sube' : 'baja') : null)

// ¿Se cumple hoy? → { cumple: true | false | null, precio?, motivo? }. precio = a qué precio saltó (el nivel, o la apertura si abrió más allá).
export function seCumple(alerta, ctx) {
  const a = alerta, r = a?.regla || {}, d = ctx?.dia || {}
  const no = (motivo) => ({ cumple: null, motivo })
  if (CUANDO[a?.tipo] === 'cierre' && !ctx?.cerrada) return no('se mira al cierre')
  const hoyCreada = !!a?.creada && (diaNY(a.creada, ctx?.zona) || '') >= ctx?.fecha
  if (a.tipo === 'toca') {
    const alto = hoyCreada ? d.ahora : d.maximo, bajo = hoyCreada ? d.ahora : d.minimo
    if (r.sentido === 'sube') {
      if (!num(alto)) return no('falta el precio')
      if (alto < r.nivel) return { cumple: false }
      return { cumple: true, precio: !hoyCreada && num(d.abre) && d.abre > r.nivel ? d.abre : hoyCreada ? d.ahora : r.nivel }
    }
    if (!num(bajo)) return no('falta el precio')
    if (bajo > r.nivel) return { cumple: false }
    return { cumple: true, precio: !hoyCreada && num(d.abre) && d.abre < r.nivel ? d.abre : hoyCreada ? d.ahora : r.nivel }
  }
  if (a.tipo === 'cierra') {
    if (!num(d.ahora)) return no('falta el cierre')
    const si = r.lado === 'encima' ? d.ahora > r.nivel : d.ahora < r.nivel
    return si ? { cumple: true, precio: d.ahora } : { cumple: false }
  }
  if (a.tipo === 'movimiento') {
    if (!positivo(ctx.cierreAyer)) return no('falta el cierre de ayer')
    const arriba = ctx.cierreAyer * (1 + r.pct / 100), abajo = ctx.cierreAyer * (1 - r.pct / 100)
    const alto = hoyCreada ? d.ahora : d.maximo, bajo = hoyCreada ? d.ahora : d.minimo, abre = hoyCreada ? null : d.abre
    const sube = r.sentido !== 'baja' && num(alto) && alto >= arriba
    const baja = r.sentido !== 'sube' && num(bajo) && bajo <= abajo
    if (!sube && !baja && !num(alto) && !num(bajo)) return no('falta el precio')
    // Si en el mismo día tocó los dos (con «ambos»), cuenta el que está más cerca del precio de ahora.
    const cual = sube && baja ? (num(d.ahora) && Math.abs(d.ahora - arriba) <= Math.abs(d.ahora - abajo) ? 'sube' : 'baja') : sube ? 'sube' : baja ? 'baja' : null
    if (!cual) return { cumple: false }
    const nivel = cual === 'sube' ? arriba : abajo
    const precio = hoyCreada ? d.ahora : num(abre) && (cual === 'sube' ? abre > nivel : abre < nivel) ? abre : nivel
    return { cumple: true, precio, sentido: cual }
  }
  if (a.tipo === 'condicion') {
    const fs = filasDe(a)
    if (typeof ctx.velasDe !== 'function') return no('faltan las velas')
    if (fs.some(f => { const v = ctx.velasDe(f.quien); return !v?.length || v[v.length - 1].date !== ctx.fecha })) return no('faltan las velas de hoy')
    const si = serieFilas(fs, ctx.velasDe, [ctx.fecha])[0] === true
    return si ? { cumple: true, precio: d.ahora ?? null } : { cumple: false }
  }
  return no('todavía no')
}

// El día de un instante en la hora de una bolsa ('AAAA-MM-DD'; por defecto Nueva York: una sesión de Wall Street es un solo día allí).
export function diaNY(ts, zona = 'America/New_York') {
  const t = new Date(ts)
  if (Number.isNaN(t.getTime())) return null
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t)
  const v = (k) => p.find(x => x.type === k)?.value
  return `${v('year')}-${v('month')}-${v('day')}`
}

// Qué hacer con la alerta tras una pasada → { salta, cambios: { activa?, armada?, ultimo_salto? }, precio?, motivo? }.
// ahora = el instante de la pasada (texto ISO o Date), para ultimo_salto. Nada que cambiar → cambios = {}.
export function decide(alerta, resultado, ctx, ahora) {
  const a = alerta, cambios = {}
  if (!a?.activa) return { salta: false, cambios, motivo: 'apagada' }
  if (a.caduca && ctx?.fecha && ctx.fecha > a.caduca) return { salta: false, cambios: { activa: false }, motivo: 'caducada' }
  const c = resultado?.cumple
  if (c == null) return { salta: false, cambios, motivo: resultado?.motivo || 'no se sabe' }
  const despues = a.despues || 'una_vez'
  if (despues === 'cada_vez') {
    const armada = a.armada !== false
    if (!c) return { salta: false, cambios: armada ? {} : { armada: true } }
    if (!armada) return { salta: false, cambios, motivo: 'esperando a que deje de cumplirse' }
    return { salta: true, cambios: { armada: false, ultimo_salto: iso(ahora) }, precio: resultado.precio }
  }
  if (!c) return { salta: false, cambios }
  if (despues === 'una_al_dia' && a.ultimo_salto && diaNY(a.ultimo_salto, ctx?.zona) === ctx.fecha) return { salta: false, cambios, motivo: 'ya saltó hoy' }
  return { salta: true, cambios: { ...(despues === 'una_vez' ? { activa: false } : {}), ultimo_salto: iso(ahora) }, precio: resultado.precio }
}
const iso = (t) => new Date(t).toISOString()

// Las dos cosas a la vez (lo que hará el comprobador con cada alerta).
export const pasada = (alerta, ctx, ahora) => { const r = seCumple(alerta, ctx); return { ...decide(alerta, r, ctx, ahora), resultado: r } }

// ── El texto del aviso (la notificación de Windows y, después, «Saltaron») ──
// Números a la española: 1.234,56 (dos decimales; cuatro si el precio es menor que 1).
export function fmt(n) {
  if (!num(n)) return '—'
  const dec = Math.abs(n) < 1 ? 4 : 2, [e, d] = Math.abs(n).toFixed(dec).split('.')
  return (n < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d
}
// → { titulo, texto }. Ej.: «CRDO tocó 111,12» · «Mínimo del día 110,40 · ahora 112,05».
export function fraseSalto(alerta, resultado, ctx) {
  const a = alerta, r = a.regla || {}, d = ctx?.dia || {}, p = resultado?.precio
  const ahora = num(d.ahora) ? `ahora ${fmt(d.ahora)}` : ''
  const junta = (...xs) => xs.filter(Boolean).join(' · ')
  if (a.tipo === 'toca') return { titulo: `${a.simbolo} tocó ${fmt(r.nivel)}`, texto: junta(r.sentido === 'sube' ? `Máximo del día ${fmt(d.maximo)}` : `Mínimo del día ${fmt(d.minimo)}`, ahora) }
  if (a.tipo === 'cierra') return { titulo: `${a.simbolo} cerró por ${r.lado === 'encima' ? 'encima' : 'debajo'} de ${fmt(r.nivel)}`, texto: `Cierre ${fmt(p)}` }
  if (a.tipo === 'movimiento') {
    const sube = resultado?.sentido === 'sube'
    return { titulo: `${a.simbolo} ${sube ? 'sube' : 'cae'} un ${Number.isInteger(r.pct) ? r.pct : fmt(r.pct)} % en el día`, texto: junta(`Cierre de ayer ${fmt(ctx?.cierreAyer)}`, sube ? `máximo ${fmt(d.maximo)}` : `mínimo ${fmt(d.minimo)}`, ahora) }
  }
  if (a.tipo === 'condicion') return { titulo: `${a.simbolo}: se cumple tu condición`, texto: junta('Al cierre', num(p) ? `cierre ${fmt(p)}` : '') }
  return { titulo: `${a.simbolo}: alerta`, texto: '' }
}
