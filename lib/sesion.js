// lib/sesion.js — ¿ha cerrado ya la sesión de la última vela?
//
// POR QUÉ. Las decisiones se toman con la vela CERRADA. Hasta ahora el motor pasaba a las estrategias
// todas las velas que llegaban, incluida la del día en curso con la sesión abierta: una estrategia
// podía entrar o salir a media sesión con un cierre que todavía iba a cambiar. Medido hoy, con el
// mercado cerrado, 99 de 9.831 operaciones se deciden en la última vela —75 son el cierre por fin de
// periodo— así que no es un fallo masivo, pero son justo las operaciones que se miran para operar.
//
// Y ojo con el matiz, que es el que decide el diseño: la vela de HOY sí vale cuando la sesión ya ha
// terminado. Sergi decide por la noche, con la sesión cerrada, y entonces el cierre de hoy es un dato
// firme. «Última vela» y «vela sin cerrar» no son lo mismo.
//
// DE DÓNDE SALE EL DATO. Del propio meta de Yahoo, sin modelar horarios de ninguna bolsa:
//   meta.currentTradingPeriod.regular = { start, end }   en segundos epoch
// Comprobado con datos reales en seis mercados: NasdaqGS y SNP (13:30→20:00 UTC), XETRA, MCE y
// Amsterdam (07:00→15:30 UTC). Y el dato clave: la vela diaria se fecha en el INSTANTE DE APERTURA de
// su sesión, no a medianoche. Para AAPL la última vela es `2026-10-02 13:30:00Z`, que es exactamente
// `currentTradingPeriod.regular.start`. Eso permite saber si la última vela es la de la sesión en
// curso comparando dos números, sin tocar zonas horarias.
//
// SI NO HAY DATO, la vela se trata como CERRADA, que es el comportamiento de siempre, y se registra en
// el log. Tratarla como abierta descartaría la última vela de todos los símbolos cuyo meta venga
// incompleto, y eso sí sería un cambio de resultados silencioso.

const DIA = 86400

// { inicio, fin } del periodo regular que Yahoo considera actual, o null si no viene.
export function periodoRegular(meta) {
  const r = meta?.currentTradingPeriod?.regular
  if (!r) return null
  const inicio = Number(r.start), fin = Number(r.end)
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null
  return { inicio, fin }
}

// ¿Está en curso la sesión de la última vela diaria?
// `tsUltima` es el timestamp (en segundos) con el que Yahoo fecha esa vela.
// Devuelve null cuando no hay información de sesión: quien llama decide y lo registra.
export function diariaEnCurso(tsUltima, meta, ahoraSeg = Math.floor(Date.now() / 1000)) {
  const p = periodoRegular(meta)
  if (!p) return null
  if (!Number.isFinite(tsUltima)) return false
  // Si la vela no empieza donde empieza el periodo regular actual, es de una sesión anterior y por
  // tanto está cerrada. Esto cubre también el caso del premercado: ahí el periodo regular ya apunta a
  // la sesión de hoy, que todavía no tiene vela, y la última vela es la de ayer.
  if (tsUltima !== p.inicio) return false
  return ahoraSeg < p.fin
}

// ¿Está en curso la semana que empieza en `lunes` (YYYY-MM-DD)?
// Una semana está cerrada cuando ha cerrado su ÚLTIMA sesión, es decir el viernes. No basta con que
// haya cerrado la sesión de hoy: un jueves por la noche la semana sigue abierta, y decidir con ella
// sería decidir con una vela a medias.
// La hora de cierre del viernes se deduce del propio periodo regular conocido, trasladándolo al
// viernes de esa semana: así se respeta el horario de cada mercado sin tener una tabla de horarios.
// Si el viernes es festivo, la semana se considera en curso hasta que ese viernes pasa — un día de
// prudencia, y nunca en la dirección peligrosa.
export function semanaEnCurso(lunes, meta, ahoraSeg = Math.floor(Date.now() / 1000)) {
  const p = periodoRegular(meta)
  if (!p) return null
  const tLunes = Date.parse(String(lunes) + 'T00:00:00Z')
  if (isNaN(tLunes)) return null
  const viernes = Math.floor(tLunes / 1000) + 4 * DIA               // lunes + 4 días
  // Día (UTC) al que pertenece el fin de sesión conocido, a medianoche.
  const diaDelFin = Math.floor(p.fin / DIA) * DIA
  const horaDeCierre = p.fin - diaDelFin                            // segundos dentro del día
  const finDelViernes = Math.floor(viernes / DIA) * DIA + horaDeCierre
  return ahoraSeg < finDelViernes
}

// Marca la última vela de una serie DIARIA. Devuelve { barras, enCurso, sinDato }.
// No muta la entrada: la última vela se reemplaza por una copia con el campo.
export function marcaDiariaEnCurso(barras, tsUltima, meta, ahoraSeg = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(barras) || !barras.length) return { barras, enCurso: false, sinDato: false }
  const r = diariaEnCurso(tsUltima, meta, ahoraSeg)
  if (r === null) return { barras, enCurso: false, sinDato: true }
  if (!r) return { barras, enCurso: false, sinDato: false }
  const salida = barras.slice()
  salida[salida.length - 1] = { ...salida[salida.length - 1], enCurso: true }
  return { barras: salida, enCurso: true, sinDato: false }
}

// Las velas que una estrategia puede mirar: todas menos la que esté en curso. Se queda en una función
// para que los tres motores usen la MISMA definición y no haya dos formas de contar.
export function soloCerradas(barras) {
  if (!Array.isArray(barras) || !barras.length) return barras
  return barras[barras.length - 1]?.enCurso ? barras.slice(0, -1) : barras
}
