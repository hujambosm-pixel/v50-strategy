// lib/builder/ociosoReglaPantalla.js — lo que pinta «Cuándo está dentro» del DINERO OCIOSO en el plan (docs/builder.md §204; boceto
// bocetos/ocioso-con-regla.html, pestañas 1 y 4; el motor, lib/planes/ociosoRegla.js §203). Puro: no toca la red ni React.
//
// En los ajustes de la pantalla: a.ociosoRegla = null (siempre dentro, lo de siempre) o { filas, siNo } TAL CUAL lo entiende el motor
// (filas guardadas { quien, si, velas, union: 'Y' }, como las reglas del bloque «Con pesos»; siNo = 'LIQUIDEZ' o un símbolo). Las filas
// de pantalla y la vuelta son las de lib/builder/reglasPesos.js (filaDePantallaRegla / filasGuardadasRegla), siempre con «Y».
import { filaNuevaRegla, fraseFilasRegla, nombreSimbolo } from './reglasPesos'

// La fila que sale al elegir «Solo cuando lo diga una regla» (decisión de Sergi, 19/11): el símbolo del ocioso, cierre sobre su EMA 200,
// velas diarias. Se cambia como cualquier fila.
export function filaOciosoDefecto(ocioso) {
  const f = filaNuevaRegla('precioVsMedia', ocioso)
  return { ...f, si: { ...f.si, p: { ...(f.si?.p || {}), lado: 'encima', tipo: 'EMA', periodo: 200 } } }
}
export const reglaOciosoNueva = (ocioso) => ({ filas: [filaOciosoDefecto(ocioso)], siNo: 'LIQUIDEZ' })
// Todas las filas con «Y» (la primera, sin unión): la regla del ocioso no admite «O» (decisión de Sergi, 19/11).
export const conY = (filas) => (filas || []).map((f, k) => { const { union, ...resto } = f || {}; return k ? { ...resto, union: 'Y' } : resto })
// La regla tal como va a la pieza: null si no hay regla o si el ocioso es la liquidez (entonces no hace falta).
export const ociosoReglaDelPlan = (a) => a?.ociosoRegla && a.ocioso && a.ocioso !== 'LIQUIDEZ' ? { filas: conY(a.ociosoRegla.filas), siNo: a.ociosoRegla.siNo } : null

// «el oro (GLD)», «QQQ», «la liquidez».
export const nombreOcioso = (s) => s === 'GLD' ? 'el oro (GLD)' : s === 'LIQUIDEZ' ? 'la liquidez' : nombreSimbolo(s)
// «a» + «el oro» = «al oro».
const aOcioso = (s) => `a ${nombreOcioso(s)}`.replace(/^a el /, 'al ')
const enDonde = (s) => s === 'LIQUIDEZ' ? 'espera en liquidez' : `va ${aOcioso(s)}`
// «Así se lee». estrategia: su nombre (con un bloque); multi: con varios bloques (el ocioso es de la cuenta).
export function fraseOciosoRegla(regla, ocioso, { estrategia = null, multi = false } = {}) {
  if (!regla) return ''
  const quien = multi ? 'ningún bloque' : estrategia ? `«${estrategia}»` : 'la estrategia', cond = fraseFilasRegla(regla.filas)
  const semanal = (regla.filas || []).some(f => f?.velas === 'semanales')
  return `El dinero que no usa ${quien} va ${aOcioso(ocioso)} solo mientras se cumpla: ${cond}. El día que deja de cumplirse, a la apertura siguiente se vende y el dinero ${enDonde(regla.siNo)}; vuelve ${aOcioso(ocioso)} a la apertura siguiente al primer cierre en que se cumpla otra vez${semanal ? ' (lo de velas semanales se conoce al cierre de la semana y actúa en la primera sesión de la siguiente)' : ''}. Si ${multi ? 'un bloque' : 'la estrategia'} necesita dinero para comprar, lo coge esté donde esté.`
}

export const AYUDA_OCIOSO_REGLA = {
  cuando: 'El dinero que no se usa (porque no hay señal) puede estar SIEMPRE en el ocioso (lo de siempre: en cuanto queda dinero libre, al oro) o solo CUANDO LO DIGA UNA REGLA: la regla se mira cada día al cierre y, si cambia, la orden va a la apertura siguiente (una condición con velas semanales se conoce al cierre de la semana y actúa en la primera sesión de la siguiente). Ejemplo: tienes 10.000 €; la estrategia está dentro con 7.000 € y sobran 3.000 €. Con la regla «GLD: cierre sobre su EMA 200», esos 3.000 € están en oro mientras GLD cierre por encima de su EMA 200; el día que cierra por debajo, a la apertura siguiente se venden (3.000 − 0,37 de comisión = 2.999,63 €) y esperan en liquidez hasta que vuelva a cumplirse. La regla no tiene prueba contra el azar: es informativa.',
  filas: 'Las condiciones del catálogo (las mismas que al crear una estrategia), sobre el símbolo del ocioso o cualquier otro, con velas diarias o semanales. Tienen que cumplirse TODAS a la vez. Ejemplo: «GLD sobre su EMA 200» y «QQQ bajo su EMA 50» = oro solo cuando el oro sube y el Nasdaq flojea.',
  siNo: 'Dónde espera el dinero ocioso mientras la regla no se cumple: en liquidez (al 0 %) o en otro símbolo con precios guardados (distinto del ocioso y de los valores de la estrategia). Ejemplo: con «en otro símbolo: SHV» (letras del Tesoro a corto), el día que el oro deja de cumplir la regla se vende el oro y se compra SHV; cuando vuelve a cumplirse, al revés (cada cambio son dos órdenes). Regla del 1 %: no se mueve una cantidad cuya comisión pase del 1 % de ella (con 0,37 € por orden, menos de 37 €).',
}
