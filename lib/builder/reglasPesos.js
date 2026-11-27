// lib/builder/reglasPesos.js — lo que pinta la sección «4 · Reglas «si… entonces…»» del bloque «Con pesos» del plan, la frase «Así se
// lee» y los ejemplos de «Cargar un ejemplo» (docs/builder.md §199; boceto bocetos/bloque-con-pesos.html). Puro: no toca la red ni React.
//
// Las reglas se guardan en el ajuste del bloque TAL CUAL las entiende el motor (lib/planes/pesos.js §194; pesos en FRACCIONES):
//   { filas: [{ quien, si, velas: 'diarias' | 'semanales', union? }], accion, mantenerMeses, despues: { tipo, filas? }, repetir }
// Aquí, el paso de esas filas a las FILAS DE PANTALLA del creador de estrategias ({ cond, env } de lib/builder/tarjetas.js, con quien,
// velas y union) y la vuelta, como los filtros del plan (lib/builder/filtrosPlan.js). Los pesos de partida del bloque van en % (§197).
import { filaDe, envuelve, filaNueva, soloDelValor, INDICES, nombreQuien, fraseFila, erroresFila, buscaCatalogo } from './tarjetas'
import { MAX_REGLAS, MAX_FILAS_REGLA, MAX_MANTENER } from '../planes/pesos'
export { MAX_REGLAS, MAX_FILAS_REGLA, MAX_MANTENER }

// La opción «Otro símbolo…» del selector «De quién» (no es un símbolo: abre el buscador).
export const OTRO_REGLA = '__otro__'
const num = (x) => { const n = Math.round(Number(x) * 100) / 100; return Number.isFinite(n) ? String(n).replace('.', ',') : '…' }
export const nombreSimbolo = (s) => s === 'LIQUIDEZ' ? 'liquidez' : s || '¿?'
// Los símbolos del bloque (sin la liquidez): los de partida y los de las acciones de sus reglas.
export const simbolosBloque = (b) => [...new Set([...(b?.pesos || []).map(p => String(p.simbolo || '').trim().toUpperCase()),
  ...(b?.reglas || []).flatMap(r => { const a = r?.accion || {}; return a.tipo === 'pesos' ? (a.pesos || []).map(p => p.simbolo) : [a.de, a.a] })]
  .filter(s => s && s !== 'LIQUIDEZ'))]

// ── Las filas (SI y «volver cuando…») ──
// Guardada { quien, si, velas, union? } → de pantalla { cond, env, quien, velas, union }. Una que no sea del creador se conserva tal cual.
export const filaDePantallaRegla = (r) => {
  const f = filaDe(r?.si), velas = r?.velas === 'semanales' ? 'semanales' : 'diarias'
  return f ? { ...f, quien: r.quien, velas, union: r.union === 'O' ? 'O' : 'Y' } : { rara: true, quien: r?.quien, si: r?.si, velas, union: r?.union === 'O' ? 'O' : 'Y' }
}
// Y la vuelta: la primera fila sin «union»; las demás, «Y» u «O».
export const filasGuardadasRegla = (fs) => fs.map((f, k) => ({ quien: f.quien, si: f.rara ? f.si : envuelve(f), velas: f.velas === 'semanales' ? 'semanales' : 'diarias', ...(k > 0 ? { union: f.union === 'O' ? 'O' : 'Y' } : {}) }))
// Las condiciones que se pueden poner en una regla: todo el catálogo menos las que solo existen para un valor dentro del Nasdaq-100
// (su fuerza frente a los demás, etc.): en una regla se mira un símbolo suelto.
export const valeEnRegla = (id) => !soloDelValor(id)
export function catalogoRegla(texto) {
  const b = buscaCatalogo(texto)
  return { grupos: b.grupos.map(g => ({ ...g, conds: g.conds.filter(valeEnRegla) })).filter(g => g.conds.length), explicacion: b.explicacion.filter(x => valeEnRegla(x.clave)) }
}
// La fila nueva de una condición del catálogo (guardada), sobre `quien`, con velas diarias.
export const filaNuevaRegla = (clave, quien) => ({ quien, si: envuelve(filaNueva(clave)), velas: 'diarias' })
// «De quién»: los símbolos del bloque, los cuatro índices, el actual si es otro y «Otro símbolo…».
export function opcionesQuienRegla(sims, actual) {
  const vistos = new Set(), out = []
  const pon = (v, t) => { if (v && !vistos.has(v)) { vistos.add(v); out.push({ v, t }) } }
  for (const s of sims) pon(s, s)
  for (const i of INDICES) pon(i.t, i.nombre)
  if (actual) pon(actual, nombreQuien(actual))
  out.push({ v: OTRO_REGLA, t: 'Otro símbolo…' })
  return out
}
export const erroresFilaRegla = (f) => { if (f.rara) return {}; try { return erroresFila(f, {}, null, f.quien) } catch (_) { return {} } }

// ── Una regla nueva y sus cambios ──
const pesosPartida = (b) => (b?.pesos || []).filter(p => p.simbolo).map(p => ({ simbolo: String(p.simbolo).trim().toUpperCase(), peso: (Number(p.peso) || 0) / 100 }))
const primero = (b) => simbolosBloque(b)[0] || 'SPY'
// SI el primer símbolo del bloque cae un 20 % desde su máximo histórico → pasar a unos pesos (de entrada, los de partida: se cambian),
// sin mantener, volver a los de partida, una vez por caída.
export const reglaNueva = (b) => ({ filas: [filaNuevaRegla('caidaDesdeMaximoHistorico', primero(b))], accion: { tipo: 'pesos', pesos: pesosPartida(b) }, mantenerMeses: 0, despues: { tipo: 'partida' }, repetir: 'porCaida' })
// Textos cortos (la columna del plan es estrecha); lo que hace cada uno, en el «?» de al lado.
export const ACCIONES_TEXTO = Object.freeze([['pesos', 'Pasar a estos pesos'], ['moverBloque', 'Mover un % del bloque'], ['moverActivo', 'Mover un % de un activo'], ['vender', 'Vender un activo']])
export const DESPUES_TEXTO = Object.freeze([['partida', 'Volver a los pesos de partida'], ['quedarse', 'Quedarse así'], ['cuando', 'Volver a los de partida cuando…']])
export const REPETIR_TEXTO = Object.freeze([['porCaida', 'Una vez por caída'], ['siempre', 'Cada vez que se cumpla'], ['unaVez', 'Solo una vez']])
// La acción nueva al cambiar de tipo (con los símbolos del bloque).
export function accionNueva(tipo, b) {
  const s = simbolosBloque(b), de = s[0] || 'SPY', a = s[1] || 'LIQUIDEZ'
  if (tipo === 'pesos') return { tipo, pesos: pesosPartida(b) }
  if (tipo === 'vender') return { tipo, de }
  return { tipo, pct: 20, de, a }
}
export const despuesNuevo = (tipo, r) => tipo === 'cuando' ? { tipo, filas: r?.despues?.filas?.length ? r.despues.filas : [filaNuevaRegla('precioVsMedia', r?.filas?.[0]?.quien || 'SPY')] } : { tipo }
// Subir (d = −1) o bajar (d = +1) la regla k.
export const mueveRegla = (rs, k, d) => { const j = k + d; if (j < 0 || j >= rs.length) return rs; const x = [...rs]; [x[k], x[j]] = [x[j], x[k]]; return x }

// ── «Así se lee» ──
export const textoPesos = (ps, enPct = false) => (ps || []).filter(p => p?.simbolo).map(p => `${num(enPct ? p.peso : p.peso * 100)} % ${nombreSimbolo(p.simbolo)}`).join(' + ') || '…'
const conVelas = (f) => f.velas === 'semanales' ? ' (velas semanales)' : ''
export function fraseFilasRegla(filas) {
  return (filas || []).map((r, k) => {
    const f = filaDePantallaRegla(r)
    let t = 'una condición'
    if (!f.rara) { try { t = fraseFila(f, {}, {}, f.quien) } catch (_) { t = nombreQuien(f.quien) } }
    return `${k ? (f.union === 'O' ? ' o ' : ' y ') : ''}${t}${conVelas(f)}`
  }).join('') || '…'
}
const fraseAccion = (a) => a?.tipo === 'pesos' ? `pasa a ${textoPesos(a.pesos)}`
  : a?.tipo === 'moverBloque' ? `mueve un ${num(a.pct)} % de todo el bloque de ${nombreSimbolo(a.de)} a ${nombreSimbolo(a.a)}`
  : a?.tipo === 'moverActivo' ? `mueve el ${num(a.pct)} % de lo que hay en ${nombreSimbolo(a.de)} a ${nombreSimbolo(a.a)}`
  : a?.tipo === 'vender' ? `vende todo ${nombreSimbolo(a.de)} (el dinero queda en la liquidez del bloque)` : 'hace…'
export function fraseRegla(r, k) {
  const m = Number(r?.mantenerMeses) || 0, d = r?.despues || {}
  const desp = d.tipo === 'quedarse' ? 'se queda así hasta que otra regla cambie algo' : d.tipo === 'cuando' ? `vuelve a los pesos de partida cuando ${fraseFilasRegla(d.filas)}` : 'vuelve a los pesos de partida'
  const quien = r?.filas?.[0]?.quien || 'ese símbolo'
  const rep = r?.repetir === 'siempre' ? 'se repite cada vez que se cumpla' : r?.repetir === 'unaVez' ? 'solo actúa una vez en todo el periodo'
    : `no se repite hasta que ${nombreSimbolo(quien)} cierre por encima del máximo que tenía el día en que se cumplió`
  return `Regla ${k + 1}: si ${fraseFilasRegla(r?.filas)}, a la apertura siguiente ${fraseAccion(r?.accion)}${m ? `, lo mantiene al menos ${m} ${m === 1 ? 'mes' : 'meses'}` : ''} y después ${desp}; ${rep}.`
}
const VOLVER_FRASE = { nunca: 'nunca vuelve a sus pesos (se dejan correr)', mes: 'cada mes vuelve a sus pesos', trimestre: 'cada trimestre vuelve a sus pesos', anio: 'cada año vuelve a sus pesos' }
const LLEGA_FRASE = { ahora: 'según los pesos de ese momento', partida: 'según los pesos de partida', atras: 'al activo que más se ha quedado atrás', liquidez: 'a la liquidez del bloque' }
// Las líneas de «Así se lee» de un bloque de pantalla (pesos de partida en %).
export function fraseBloquePesos(b) {
  const v = b?.volver?.cada === 'banda' ? `vuelve a sus pesos si alguno se separa más de ${num(b.volver.puntos)} puntos` : VOLVER_FRASE[b?.volver?.cada] || VOLVER_FRASE.nunca
  const rs = Array.isArray(b?.reglas) ? b.reglas : []
  return [
    `El bloque empieza con ${textoPesos(b?.pesos, true)}; ${v}; el dinero que le llega va ${LLEGA_FRASE[b?.aportaciones] || LLEGA_FRASE.ahora}.`,
    ...(rs.length ? rs.map(fraseRegla) : ['Sin reglas: los pesos solo cambian al volver a ellos (comprar y mantener).']),
    ...(rs.length > 1 ? ['Cada día, al cierre, se miran las reglas en orden y como mucho actúa una (la primera que se cumple); mientras una mantiene, las demás esperan.'] : []),
  ]
}

// ── Los ejemplos de «Cargar un ejemplo» ──
// Nombres inventados (normas de textos); los números, de la idea pública que imitan, con sus supuestos en AYUDA_REGLAS.ejemplos.
// Cada uno da el bloque de pantalla sin su % del plan: pesos (en %), volver, aportaciones y reglas (formato del motor).
const fila = (clave, quien, p = {}, velas = 'diarias', union) => { const f = filaNueva(clave); return { quien, si: envuelve({ ...f, cond: { ...f.cond, p: { ...f.cond.p, ...p } } }), velas, ...(union ? { union } : {}) } }
export const EJEMPLOS_PESOS = Object.freeze([
  { id: 'caidas', nombre: '80/20 que compra en caídas', bloque: () => ({
    pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }], volver: { cada: 'anio', puntos: 10 }, aportaciones: 'ahora',
    reglas: [{ filas: [fila('caidaDesdeMaximoHistorico', 'TQQQ', { pct: 40 })], accion: { tipo: 'pesos', pesos: [{ simbolo: 'SPY', peso: 0.6 }, { simbolo: 'TQQQ', peso: 0.4 }] },
      mantenerMeses: 12, despues: { tipo: 'partida' }, repetir: 'porCaida' }] }) },
  { id: 'rota', nombre: '60/40 que rota en caídas', bloque: () => ({
    pesos: [{ simbolo: 'QQQ', peso: 60 }, { simbolo: 'TQQQ', peso: 40 }], volver: { cada: 'nunca', puntos: 10 }, aportaciones: 'ahora',
    reglas: [{ filas: [fila('caidaDesdeMaximoHistorico', 'TQQQ', { pct: 40 })], accion: { tipo: 'moverBloque', pct: 20, de: 'QQQ', a: 'TQQQ' },
      mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'porCaida' }] }) },
  { id: 'refugio', nombre: 'Oro como refugio', bloque: () => ({
    pesos: [{ simbolo: 'QQQ', peso: 70 }, { simbolo: 'GLD', peso: 30 }], volver: { cada: 'trimestre', puntos: 10 }, aportaciones: 'atras',
    reglas: [{ filas: [fila('precioVsMedia', 'SPY', { lado: 'debajo', tipo: 'EMA', periodo: 40 }, 'semanales')],
      accion: { tipo: 'pesos', pesos: [{ simbolo: 'QQQ', peso: 0.2 }, { simbolo: 'GLD', peso: 0.5 }, { simbolo: 'LIQUIDEZ', peso: 0.3 }] },
      mantenerMeses: 1, despues: { tipo: 'cuando', filas: [fila('precioVsMedia', 'SPY', { lado: 'encima', tipo: 'EMA', periodo: 40 }, 'semanales')] }, repetir: 'siempre' }] }) },
  // §280: el SPY como dinero «disponible»: en las caídas pasa un 20 % del bloque a QQQ y otro 20 % a TQQQ cuando el SPY rebota sobre su
  // EMA 20; cuando vuelve a su máximo histórico, todo al SPY. Las dos caídas, «una vez por caída»; la vuelta, en una regla aparte.
  { id: 'reserva', nombre: 'SPY de reserva que compra en caídas', bloque: () => {
    const sobreEma = fila('precioVsMedia', 'SPY', { lado: 'encima', tipo: 'EMA', periodo: 20 }, 'diarias', 'Y')
    const caida = (pct, a) => ({ filas: [fila('caidaDesdeMaximoHistorico', 'SPY', { pct }), sobreEma], accion: { tipo: 'moverBloque', pct: 20, de: 'SPY', a }, mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'porCaida' })
    return { pesos: [{ simbolo: 'SPY', peso: 100 }], volver: { cada: 'nunca', puntos: 10 }, aportaciones: 'ahora',
      reglas: [caida(10, 'QQQ'), caida(20, 'TQQQ'),
        { filas: [fila('enMaximoHistorico', 'SPY', { margen: 0 })], accion: { tipo: 'pesos', pesos: [{ simbolo: 'SPY', peso: 1 }] }, mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'siempre' }] } } },
])

// ── Textos de los «?» ──
export const AYUDA_REGLAS = Object.freeze({
  reglas: 'Cada día, al cierre, se miran las reglas EN ORDEN; la primera que se cumple actúa a la apertura de la sesión siguiente (como mucho una al día). Las condiciones son las del catálogo de las estrategias, sobre cualquier símbolo (esté o no en el bloque) y con velas diarias o semanales (la semana ya cerrada: se sabe al cierre del viernes y la orden va el lunes). '
    + 'Mientras una regla «mantiene», las demás esperan y no se vuelve a los pesos; el dinero que llega va según los pesos de ese momento. Ejemplo: 80 % SPY + 20 % TQQQ con 10.000 € en el bloque; el TQQQ cae un 40 % desde su máximo y el bloque vale 9.000 € (7.600 € SPY y 1.400 € TQQQ). La regla «pasar a 60/40» deja 5.400 € y 3.600 €: vende 2.200 € de SPY y compra 2.200 € de TQQQ.',
  accion: '«Pasar a estos pesos»: reparte todo el bloque con esos pesos. «Mover un % del bloque» (un % de TODO el bloque): con un bloque de 10.000 €, mover un 20 % de QQQ a TQQQ vende 2.000 € de QQQ y compra 2.000 € de TQQQ (si en QQQ hay menos, mueve lo que haya). «Mover un % de un activo» (un % de lo que hay en ese activo): con 3.000 € en GLD, mover el 50 % de GLD a QQQ mueve 1.500 €. «Vender un activo»: lo vende entero y el dinero se queda en la liquidez del bloque (no rinde).',
  mantener: 'Durante esos meses la regla no se deshace: no se vuelve a los pesos del bloque y las demás reglas esperan. 0 = no mantiene: el «después» se mira desde el día siguiente. Ejemplo: actúa el 10 de marzo con 12 meses → hasta el 10 de marzo del año siguiente.',
  despues: '«Volver a los pesos de partida»: al acabar «mantener», vende y compra lo necesario para volver a ellos. «Quedarse así»: los pesos que deja la regla pasan a ser los de volver a los pesos del bloque, hasta que otra regla cambie algo. «Volver a los de partida cuando…»: espera a que se cumplan esas condiciones (después de «mantener»).',
  repetir: '«Una vez por caída»: tras actuar, no vuelve a actuar hasta que el símbolo de su primera condición cierre por encima del máximo que tenía el día en que se cumplió (así una caída larga no la dispara cada día). «Cada vez que se cumpla»: puede volver a actuar en cuanto acabe lo anterior. «Solo una vez»: la primera vez y nunca más.',
  quien: 'De qué símbolo se mira la condición: los del bloque, los índices o cualquier otro con precios guardados (por ejemplo, el oro, GLD). No hace falta que esté en el bloque: «si el SPY cierra por debajo de su EMA 40, pasar a oro» mira el SPY aunque el bloque no lo tenga.',
  ejemplos: 'Cuatro ejemplos inventados para empezar; luego puedes cambiarlo todo. Cargar uno cambia los pesos, «volver a los pesos», el dinero que le llega y las reglas de este bloque (no su % del plan). '
    + '«80/20 que compra en caídas»: 80 % SPY + 20 % TQQQ, vuelve a sus pesos cada año; si el TQQQ cae un 40 % desde su máximo histórico, pasa a 60/40 durante al menos 12 meses y luego vuelve (supuesto: lo que pasa al acabar el año no lo dice la idea original). '
    + '«60/40 que rota en caídas»: 60 % QQQ + 40 % TQQQ, nunca vuelve a sus pesos; con la misma caída mueve un 20 % del bloque de QQQ a TQQQ y se queda así (supuestos: el 20 % es de todo el bloque y no vuelve a 60/40). '
    + '«Oro como refugio»: 70 % QQQ + 30 % oro (GLD); si el SPY cierra la semana bajo su EMA 40, pasa a 20 % QQQ + 50 % GLD + 30 % liquidez y vuelve cuando el SPY cierre la semana por encima. '
    + '«SPY de reserva que compra en caídas»: 100 % SPY, que hace de dinero disponible; si el SPY ha caído al menos un 10 % desde su máximo histórico y cierra sobre su EMA 20, mueve un 20 % del bloque de SPY a QQQ; si ha caído al menos un 20 % (y cierra sobre su EMA 20), otro 20 % de SPY a TQQQ; cada una, una vez por caída. Cuando el SPY vuelve a su máximo histórico, todo vuelve al SPY. Ejemplo: 10.000 € en SPY; cae un 10 % (9.000 €) y rebota sobre su EMA 20: 1.800 € pasan a QQQ.',
})
