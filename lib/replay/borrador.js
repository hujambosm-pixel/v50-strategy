// lib/replay/borrador.js — marcar una orden EN EL GRÁFICO del Replay (docs/builder.md §229; boceto bocetos/replay-simulacion.html v2).
// PURO. La orden que se marca con 🎯 o doble clic es el mismo FORMULARIO del panel (lib/replay/orden.js): { lado, mercado, entrada, stop,
// objetivo, modo, pct } con los precios como texto. Mientras tenga algún precio y no se haya enviado, es un BORRADOR («SIN ENVIAR»).
//
// 🎯: tres clics seguidos en el gráfico → Entrada, Stop, Objetivo. Doble clic: la Entrada en ese precio y sigue con el Stop.
// El LADO sale del stop (o del objetivo si no hay stop): por debajo de la entrada = compra; por encima = corto.
// LÍNEAS del gráfico (todas se arrastran salvo el precio medio de la posición):
//   borrador  bor:entrada · bor:stop · bor:objetivo     → cambian el formulario
//   viva      viva:<id>:entrada | :stop | :objetivo       → al soltar, acción «mover» (la entrada cambia también la clase: límite o stop)
//   posición  pos:<símbolo>:stop | :objetivo              → al soltar, acción «mover»
import { claseDe } from './motor'
import { compruebaOrden } from './orden'

export const FORM_INICIAL = { lado: 1, mercado: true, entrada: '', stop: '', objetivo: '', modo: 'invertir', pct: 20, stopPct: '', rr: '' }
// §234: stopPct («Stop a X %») y rr («R:R 1 : N») son opcionales: vacíos, el stop y el objetivo se marcan a mano; con ellos, salen solos.
// ladoFijo: el lado lo dio el botón (🎯 Compra / 🎯 Venta) y no se deduce del stop.
// §250 (los valores por defecto del ⚙): tipo 'precio' (se marca con 🎯) | 'mercado'; stopModo 'pct' | 'marco' | 'no' (sin stop);
// tpModo 'rr' | 'marco' | 'no' (sin objetivo). Sin ellos (formularios de antes), se deducen: con stopPct → 'pct', si no → 'marco'; igual el R:R.
// §252: stopModo 'atr' = a stopAtr veces el ATR (14) de la vela de hoy (atrHoy, lo pone la página); sigueTipo / sigueN / sigueK = el stop
// que sigue al precio (TIPOS_SIGUE de lib/replay/motor.js); sale = con qué sale «Ejecutar solo» ('panel' | 'estrategia').

const num = (x) => (x === '' || x == null ? null : Number(String(x).replace(',', '.')))
export const modoStop = (f) => f.stopModo || (num(f.stopPct) != null ? 'pct' : 'marco')
export const modoObjetivo = (f) => f.tpModo || (num(f.rr) != null ? 'rr' : 'marco')
const ok = (x) => Number.isFinite(x) && x > 0

// El precio de un clic, redondeado: 2 decimales (4 si vale menos de 1).
export const redondea = (p) => (Math.abs(p) < 1 ? Math.round(p * 1e4) / 1e4 : Math.round(p * 100) / 100)
// Como se escribe en la casilla: «63,78».
export const enCasilla = (p) => String(redondea(p)).replace('.', ',')

export const hayBorrador = (f) => !!f && [f.mercado ? null : f.entrada, f.stop, f.objetivo].some(x => x !== '' && x != null)

// El precio de referencia de la orden: la entrada, o el de ahora si va a mercado.
const refDe = (f, ahora) => (f.mercado ? ahora : num(f.entrada))

// El lado según dónde quedan stop u objetivo (sin ninguno de los dos, el que ya tenía).
export function ladoDe(f, ahora) {
  const ref = refDe(f, ahora), s = num(f.stop), o = num(f.objetivo)
  if (!ok(ref)) return f.lado
  if (ok(s) && s !== ref) return s < ref ? 1 : -1
  if (ok(o) && o !== ref) return o > ref ? 1 : -1
  return f.lado
}

// §234: el stop a X % de la referencia (por debajo en una compra, por encima en un corto) y el objetivo a R:R veces la distancia al stop.
// Ej.: compra a 100 con «Stop a 10 %» y R:R 1 : 2 → stop 90, objetivo 120. Corto a 100, 5 % y 1 : 1 → stop 105, objetivo 95.
export function stopAuto(lado, ref, stopPct) { const x = num(stopPct); return ok(ref) && ok(x) && x < 100 ? redondea(ref * (1 - (lado > 0 ? 1 : -1) * x / 100)) : null }
// §252: a k veces el ATR de la entrada (por debajo en una compra). Ej.: entrada 100, ATR 2,5 y k = 2 → stop 95.
export function stopAtrAuto(lado, ref, k, atrHoy) { const x = num(k), a = num(atrHoy); if (!ok(ref) || !ok(x) || !ok(a)) return null; const s = redondea(ref - (lado > 0 ? 1 : -1) * x * a); return s > 0 ? s : null }
export function objetivoAuto(ref, stop, rr) { const x = num(rr); if (!ok(ref) || !ok(stop) || !ok(x) || stop === ref) return null; const o = redondea(ref + (ref - stop) * x); return o > 0 ? o : null }
// Rellena lo que falta con stopPct y rr. desde: 'entrada' (rehace stop y objetivo) | 'stop' (rehace el objetivo) | null (solo lo vacío).
export function conAuto(f, ahora, desde = null) {
  const ref = refDe(f, ahora)
  let g = { ...f }
  if ((desde === 'entrada' || g.stop === '' || g.stop == null) && modoStop(g) === 'pct' && num(g.stopPct) != null) { const s = stopAuto(g.lado, ref, g.stopPct); if (s != null) g = { ...g, stop: enCasilla(s), ladoFijo: true } }
  if ((desde === 'entrada' || g.stop === '' || g.stop == null) && modoStop(g) === 'atr') { const s = stopAtrAuto(g.lado, ref, g.stopAtr === '' || g.stopAtr == null ? 2 : g.stopAtr, g.atrHoy); if (s != null) g = { ...g, stop: enCasilla(s), ladoFijo: true } }
  if ((desde || g.objetivo === '' || g.objetivo == null) && modoObjetivo(g) === 'rr' && num(g.rr) != null) { const o = objetivoAuto(ref, num(g.stop), g.rr); if (o != null) g = { ...g, objetivo: enCasilla(o) } }
  return g
}
const ladoSi = (g, ahora) => (g.ladoFijo ? g.lado : ladoDe(g, ahora))
// Lo que se marca después: el stop si falta (salvo «sin stop»), luego el objetivo (salvo «sin objetivo»); si no queda nada, la orden está lista.
const vacio = (x) => x === '' || x == null
const siguiente = (g) => (vacio(g.stop) && modoStop(g) !== 'no' ? { f: g, captura: 'stop' } : vacio(g.objetivo) && modoObjetivo(g) !== 'no' && !(vacio(g.stop) && modoObjetivo(g) === 'rr') ? { f: g, captura: 'objetivo' } : { f: g, captura: null, listo: true })

// Un clic en el gráfico mientras se marca: rellena lo que toca y dice qué se marca después (con stopPct y rr, lo demás sale solo:
// con los dos, un clic en la entrada deja la orden lista).
export function conClic(f, captura, precio, ahora) {
  const p = enCasilla(precio)
  if (captura === 'entrada') return siguiente(conAuto({ ...f, mercado: false, entrada: p, stop: '', objetivo: '' }, ahora, 'entrada'))
  if (captura === 'stop') { const g = { ...f, stop: p }; const h = { ...g, lado: ladoSi(g, ahora) }; return siguiente(conAuto(h, ahora, 'stop')) }
  if (captura === 'objetivo') { const g = { ...f, objetivo: p }; return { f: { ...g, lado: ladoSi(g, ahora) }, captura: null, listo: true } }
  return { f, captura: null }
}

// Empezar a marcar: borra los precios del borrador anterior. lado (1 | −1) = 🎯 Compra / 🎯 Venta; sin él (🎯 de arriba), el lado sale del stop.
export const empiezaMarca = (f, lado = null) => ({ f: { ...f, mercado: false, entrada: '', stop: '', objetivo: '', ...(lado ? { lado, ladoFijo: true } : { ladoFijo: false }) }, captura: 'entrada' })
// Doble clic: la entrada ahí (con el lado del último botón si el stop sale solo) y se sigue con lo que falte.
export const dobleClic = (f, precio, ahora = null) => conClic({ ...f, ladoFijo: false }, 'entrada', precio, ahora)
// Al arrastrar una línea del borrador: el precio nuevo y, con stopPct / rr, lo que depende de él.
export function mueveBorrador(f, campo, precio, ahora) {
  const g = { ...f, [campo]: enCasilla(precio) }
  if (campo === 'objetivo') return { ...g, lado: ladoSi(g, ahora) }
  const h = campo === 'stop' ? { ...g, lado: ladoSi(g, ahora) } : g
  return conAuto(h, ahora, campo)
}
// A mercado (botón verde o rojo): el lado del botón y, con stopPct / rr, el stop y el objetivo que estén vacíos.
export const deMercado = (f, lado, ahora) => conAuto({ ...f, mercado: true, entrada: '', lado, ladoFijo: true }, ahora)

// «≈ 31 acciones (1.977 €) · arriesgas 60 € · R:R 1 : 1,5», con el dinero de ahora (al ejecutarse puede variar un poco).
export function estima(f, total, ahora) {
  const ref = refDe(f, ahora), s = num(f.stop), o = num(f.objetivo), pct = num(f.pct)
  if (!ok(ref) || !ok(total) || !ok(pct)) return null
  const riesgo = ok(s) ? Math.abs(ref - s) : null
  const q = f.modo === 'arriesgar' ? (riesgo ? Math.floor(total * pct / 100 / riesgo + 1e-9) : null) : Math.floor(total * pct / 100 / ref + 1e-9)
  if (q == null) return null
  return { acciones: q, coste: q * ref, arriesgas: riesgo ? q * riesgo : null, rr: riesgo && ok(o) ? Math.abs(o - ref) / riesgo : null }
}

// % de un precio frente a la referencia: −3,0 % / +4,5 %.
export const pctFrente = (p, ref) => (ok(p) && ok(ref) ? (p / ref - 1) * 100 : null)
const txtPct = (x) => (x == null ? '' : ` ${x >= 0 ? '+' : '−'}${Math.abs(x).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)

export const COLORES = { entrada: '#58a6ff', stop: '#f85149', objetivo: '#3fb950', medio: '#f3f3f5' }

// Las líneas del gráfico para un valor: [{ id, precio, color, texto, estilo: 0 sólida | 2 discontinua, grosor, arrastrable }].
export function lineasDe(r, simbolo, f, ahora, terminada = false, marcando = false) {
  const L = []
  const pon = (id, precio, color, texto, estilo, grosor, arrastrable) => { if (ok(precio)) L.push({ id, precio, color, texto, estilo, grosor, arrastrable: arrastrable && !terminada }) }
  const pos = r?.posiciones?.[simbolo]
  if (pos) {
    pon(`pos:${simbolo}:medio`, pos.precioMedio, COLORES.medio, `#${pos.num} ${pos.lado > 0 ? 'Largo' : 'Corto'} ${pos.acciones}`, 2, 1, false)
    pon(`pos:${simbolo}:stop`, pos.stop, COLORES.stop, `#${pos.num} Stop${txtPct(pctFrente(pos.stop, pos.precioMedio))} ⇕`, 2, 1, true)
    pon(`pos:${simbolo}:objetivo`, pos.objetivo, COLORES.objetivo, `#${pos.num} Objetivo${txtPct(pctFrente(pos.objetivo, pos.precioMedio))} ⇕`, 2, 1, true)
  }
  for (const o of r?.ordenesVivas || []) {
    if (o.simbolo !== simbolo) continue
    const que = `${o.lado > 0 ? 'Compra' : 'Corto'} ${o.entrada == null ? 'a mercado' : o.clase === 'limite' ? 'límite' : 'stop'}`
    pon(`viva:${o.id}:entrada`, o.entrada, COLORES.entrada, `${que} ⇕`, 2, 1, true)
    const ref = o.entrada == null ? ahora : o.entrada
    pon(`viva:${o.id}:stop`, o.stop, COLORES.stop, `Stop${txtPct(pctFrente(o.stop, ref))} ⇕`, 2, 1, true)
    pon(`viva:${o.id}:objetivo`, o.objetivo, COLORES.objetivo, `Objetivo${txtPct(pctFrente(o.objetivo, ref))} ⇕`, 2, 1, true)
  }
  if (hayBorrador(f) && !terminada) {
    // El rótulo «SIN ENVIAR» va en la primera línea del borrador que haya.
    const ref = refDe(f, ahora), n0 = L.length
    if (!f.mercado) pon('bor:entrada', num(f.entrada), COLORES.entrada, 'Entrada ⇕', 0, 2, true)
    pon('bor:stop', num(f.stop), COLORES.stop, `Stop${txtPct(pctFrente(num(f.stop), ref))} ⇕`, 0, 2, true)
    pon('bor:objetivo', num(f.objetivo), COLORES.objetivo, `Objetivo${txtPct(pctFrente(num(f.objetivo), ref))} ⇕`, 0, 2, true)
    if (L.length > n0) L[n0] = { ...L[n0], texto: `${marcando ? 'MARCANDO' : 'SIN ENVIAR'} · ${L[n0].texto}` }
  }
  return L
}

// §236: las CAJAS del gráfico, como la herramienta «Posición larga / corta» de los dibujos: zona roja entre la entrada y el stop, verde
// entre la entrada y el objetivo, y líneas continuas de la vela «desde» a la vela «hasta» (null = hasta el hueco de la derecha, siguen
// vivas). [{ id, tipo: 'cerrada' | 'posicion' | 'viva' | 'borrador', lado, desde, hasta, entrada, stop, objetivo,
// lineas: { entrada, stop, objetivo } (ids de las líneas que se arrastran, para seguirlas mientras se mueven), textos: { … } }].
//   · cerrada: de la vela de entrada a la de salida, tenue y sin textos (la caja «#n ±x %» ya la pone el gráfico).
//   · posición: de la vela de entrada en adelante. · orden viva: desde la vela en que se puso, con «sin ejecutar». · borrador: desde hoy.
export function cajasDe(r, simbolo, f, ahora, hoy, terminada = false, marcando = false) {
  const C = []
  const pc = (p, ref) => txtPct(pctFrente(p, ref))
  for (const o of r?.operaciones || []) {
    if (o.simbolo !== simbolo || !o.fechaSalida) continue
    C.push({ id: `op:${o.num}`, tipo: 'cerrada', lado: o.lado, desde: o.fechaEntrada, hasta: o.fechaSalida, entrada: o.precioEntrada, stop: o.stop ?? null, objetivo: o.objetivo ?? null, lineas: {}, textos: {} })
  }
  const pos = r?.posiciones?.[simbolo]
  if (pos) C.push({ id: `pos:${simbolo}`, tipo: 'posicion', lado: pos.lado, desde: pos.fecha, hasta: null, entrada: pos.precioMedio, stop: pos.stop, objetivo: pos.objetivo,
    lineas: { entrada: `pos:${simbolo}:medio`, stop: `pos:${simbolo}:stop`, objetivo: `pos:${simbolo}:objetivo` },
    textos: { entrada: `#${pos.num} ${pos.lado > 0 ? 'Largo' : 'Corto'} ${pos.acciones}`, stop: `Stop${pc(pos.stop, pos.precioMedio)}`, objetivo: `Objetivo${pc(pos.objetivo, pos.precioMedio)}` } })
  for (const o of r?.ordenesVivas || []) {
    if (o.simbolo !== simbolo) continue
    const ref = o.entrada == null ? ahora : o.entrada
    const que = `${o.lado > 0 ? 'Compra' : 'Corto'} ${o.entrada == null ? 'a mercado' : o.clase === 'limite' ? 'límite' : 'stop'}`
    C.push({ id: `viva:${o.id}`, tipo: 'viva', lado: o.lado, desde: o.cambiada || o.fecha, hasta: null, entrada: ref,   // §238: «desde» = su último cambio
      stop: o.stop ?? null, objetivo: o.objetivo ?? null,
      lineas: { entrada: o.entrada == null ? null : `viva:${o.id}:entrada`, stop: `viva:${o.id}:stop`, objetivo: `viva:${o.id}:objetivo` },
      textos: { entrada: `${que} · sin ejecutar`, stop: `Stop${pc(o.stop, ref)}`, objetivo: `Objetivo${pc(o.objetivo, ref)}` } })
  }
  if (hayBorrador(f) && !terminada) {
    const ref = refDe(f, ahora)
    if (ok(ref)) C.push({ id: 'bor', tipo: 'borrador', lado: f.lado, desde: hoy, hasta: null, entrada: ref, stop: num(f.stop), objetivo: num(f.objetivo),
      lineas: { entrada: f.mercado ? null : 'bor:entrada', stop: 'bor:stop', objetivo: 'bor:objetivo' },
      textos: { entrada: `${marcando ? 'MARCANDO' : 'SIN ENVIAR'} · Entrada`, stop: `Stop${pc(num(f.stop), ref)}`, objetivo: `Objetivo${pc(num(f.objetivo), ref)}` } })
  }
  return C
}

// §233: lo marcado en el gráfico ES la orden (sin «Enviar orden»): se pone al marcar el objetivo, con Enter (sin objetivo, o sin stop
// ni objetivo) o al avanzar mientras se marca. Si el objetivo quedó al otro lado de la entrada, la orden se pone sin él y lo avisa.
export function ordenDeMarca(f, ahora) {
  const g = { ...f, mercado: false }
  const c = compruebaOrden(g, ahora)
  if (c.error && num(g.objetivo) != null) {
    const c2 = compruebaOrden({ ...g, objetivo: '' }, ahora)
    if (!c2.error) return { orden: c2.orden, aviso: 'El objetivo quedó al otro lado de la entrada: la orden se puso sin objetivo (arrastra su línea o escríbelo en su casilla).' }
  }
  return c
}

// §233: quitar una operación (cerrada o la abierta) del historial: se borran las órdenes que la abrieron o ampliaron (op.ids) y lo que se
// hizo con ella (sus «mover», los «mover» y «cerrar» de su valor mientras estuvo abierta). El motor lo recalcula todo: desaparece también de
// la curva del capital. Cuenta en «borradas» (como los retrocesos). null si no se encuentra su orden.
export function quitaOperacion(estado, op) {
  const ids = new Set(op?.ids || []), lista = estado?.acciones || []
  const fechas = lista.filter(a => a.tipo === 'orden' && ids.has(a.id)).map(a => a.fecha).sort()
  if (!fechas.length) return null
  const desde = fechas[0], hasta = op.fechaSalida || '9999-12-31'
  const acciones = lista.filter(a => {
    if (a.tipo === 'orden') return !ids.has(a.id)
    if (a.id != null && ids.has(a.id)) return false
    if (a.simbolo === op.simbolo && a.fecha >= desde && ((a.tipo === 'mover' && a.id == null && a.fecha < hasta) || (a.tipo === 'cerrar' && a.fecha <= hasta))) return false
    return true
  })
  return { ...estado, acciones, borradas: (estado.borradas || 0) + 1 }
}

// Al soltar una línea de una orden viva o de la posición: la acción «mover» (o un aviso si quedaría al otro lado).
// precio null = quitar el stop o el objetivo (la entrada no se puede quitar: para eso, ✕ cancela la orden).
export function accionMover(estado, r, id, precio, ahora) {
  const [que, a, campo] = String(id).split(':')
  if (precio == null) {
    if (campo !== 'stop' && campo !== 'objetivo') return { error: 'La entrada no se puede quitar: para eso, cancela la orden con ✕.' }
    if (que === 'pos') return r.posiciones[a] ? { accion: { fecha: estado.hoy, simbolo: a, tipo: 'mover', [campo]: null } } : { error: 'Esa posición ya no está abierta.' }
    const o = (r.ordenesVivas || []).find(x => String(x.id) === a)
    return o ? { accion: { fecha: estado.hoy, simbolo: o.simbolo, tipo: 'mover', id: o.id, [campo]: null } } : { error: 'Esa orden ya no está viva.' }
  }
  if (!(Number.isFinite(precio) && precio > 0)) return { error: 'El precio tiene que ser un número mayor que 0.' }
  const p = redondea(precio)
  if (que === 'pos') {
    const pos = r.posiciones[a]; if (!pos) return { error: 'Esa posición ya no está abierta.' }
    if (campo !== 'stop' && campo !== 'objetivo') return { error: 'Esa línea no se mueve.' }
    const largo = pos.lado > 0
    if (campo === 'stop' && (largo ? p >= ahora : p <= ahora)) return { error: largo ? 'El stop de una compra va por debajo del precio de ahora (para salir ya, «Cerrar a mercado»).' : 'El stop de un corto va por encima del precio de ahora (para salir ya, «Cerrar a mercado»).' }
    if (campo === 'objetivo' && (largo ? p <= ahora : p >= ahora)) return { error: largo ? 'El objetivo de una compra va por encima del precio de ahora (para salir ya, «Cerrar a mercado»).' : 'El objetivo de un corto va por debajo del precio de ahora (para salir ya, «Cerrar a mercado»).' }
    return { accion: { fecha: estado.hoy, simbolo: a, tipo: 'mover', [campo]: p } }
  }
  if (que === 'viva') {
    const o = r.ordenesVivas.find(x => String(x.id) === a); if (!o) return { error: 'Esa orden ya no está viva.' }
    const largo = o.lado > 0
    if (campo === 'entrada') {
      if (o.stop != null && (largo ? o.stop >= p : o.stop <= p)) return { error: 'La entrada no puede pasar al otro lado de su stop.' }
      if (o.objetivo != null && (largo ? o.objetivo <= p : o.objetivo >= p)) return { error: 'La entrada no puede pasar al otro lado de su objetivo.' }
      return { accion: { fecha: estado.hoy, simbolo: o.simbolo, tipo: 'mover', id: o.id, entrada: p, clase: claseDe(o.lado, p, ahora) } }
    }
    const ref = o.entrada == null ? ahora : o.entrada
    if (campo === 'stop' && (largo ? p >= ref : p <= ref)) return { error: largo ? 'En una compra el stop va por debajo de la entrada.' : 'En un corto el stop va por encima de la entrada.' }
    if (campo === 'objetivo' && (largo ? p <= ref : p >= ref)) return { error: largo ? 'En una compra el objetivo va por encima de la entrada.' : 'En un corto el objetivo va por debajo de la entrada.' }
    return { accion: { fecha: estado.hoy, simbolo: o.simbolo, tipo: 'mover', id: o.id, [campo]: p } }
  }
  return { error: 'Esa línea no se mueve.' }
}

// Añadir una acción: dos «mover» seguidos del mismo día y de la misma cosa se juntan en uno (no se llena la lista al arrastrar).
export function anade(acciones, a) {
  const l = acciones || [], u = l[l.length - 1]
  if (a.tipo === 'mover' && u && u.tipo === 'mover' && u.fecha === a.fecha && (u.id ?? null) === (a.id ?? null) && u.simbolo === a.simbolo) return [...l.slice(0, -1), { ...u, ...a }]
  return [...l, a]
}
