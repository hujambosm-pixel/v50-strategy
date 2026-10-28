// lib/avisoFechaFinal.js — el aviso ámbar encima del gráfico cuando no llega a la última sesión (V9.1071; docs/builder.md, §38).
// Lo usan «Backtest de un valor» (pages/index.js) y el paso 1 del Builder (components/BuilderSenales.js). Solo avisa: no impide nada.
//
// Dos casos, que no se mezclan:
//   'fechas'  el periodo está en «Fechas» (en el paso 1, «Otras fechas») y su fecha final es anterior a la última sesión esperada:
//             el gráfico acaba ahí porque se eligió así (el 28/10/2026, «Backtest de un valor» acababa el 20/10 por esto).
//   'faltan'  el periodo pide llegar a hoy y la última vela es más antigua que la última sesión esperada: faltan precios.
// La última sesión esperada es el último día de lunes a viernes ANTERIOR a hoy: la de hoy no se exige (puede no haber abierto). Se
// cuentan los fines de semana; los festivos no, así que un festivo puede dar un aviso de más (aceptado). En semanal, la última
// semana cerrada: la de esta semana si hoy es sábado o domingo; si no, la anterior (las velas semanales llevan la fecha de su lunes).
import { lunesDeSemana } from './velasSemanales'

const iso = (d) => d.toISOString().slice(0, 10)
const masDias = (fecha, n) => iso(new Date(Date.parse(fecha + 'T00:00:00Z') + n * 864e5))
export const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
// Hoy en el calendario de quien mira (no en UTC): a las 00:30 en Barcelona ya es el día siguiente.
export const hoyLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function ultimaSesionEsperada(hoy) {
  let f = masDias(hoy, -1)
  while ([0, 6].includes(new Date(f + 'T00:00:00Z').getUTCDay())) f = masDias(f, -1)
  return f
}
export function ultimaSemanaCerrada(hoy) {
  const dia = new Date(hoy + 'T00:00:00Z').getUTCDay(), lunes = lunesDeSemana(hoy)
  return dia === 0 || dia === 6 ? lunes : masDias(lunes, -7)
}

export const AYUDA_FECHAS = 'En «Fechas» el periodo empieza y termina en las fechas que escribiste: la fecha final no avanza sola cuando pasan los días. «Últimos N años» siempre llega a hoy. Ejemplo: con fin el 20/10/2026, el 28/10 el gráfico sigue acabando el 20/10. Para ver hasta la última sesión, elige «Últimos N años» o cambia la fecha final. Es solo un aviso: el backtest es correcto para las fechas elegidas.'
export const AYUDA_FALTAN = 'La última vela que ha llegado es anterior a la última sesión de bolsa que debería haber (la de ayer, o el viernes si hoy es lunes; en semanal, la última semana cerrada). Se cuentan los fines de semana, no los festivos: un festivo puede dar este aviso sin que falte nada. Si no es festivo, suele ser un retraso del proveedor de precios (Yahoo) o de la caché: vuelve a cargar dentro de un rato y, si sigue, mira el valor en Yahoo Finance. Es solo un aviso: los cálculos usan las velas que hay.'

// simbolo; modo: 'fechas' (fecha final elegida a mano), 'hoy' (el periodo pide llegar a hoy) u otro (sin aviso: el ensayo del
// paso 1); hasta: la fecha final elegida (ISO); ultima: la fecha de la última vela (ISO; en semanal, la de su lunes); intervalo;
// nombreModo: cómo se llama el modo en esa pantalla. Devuelve null o { tipo, texto, ayuda }.
export function avisoFechaFinal({ simbolo, modo, hasta = null, ultima = null, intervalo = 'diario', hoy = hoyLocal(), nombreModo = 'Fechas' }) {
  const sesion = ultimaSesionEsperada(hoy)
  if (modo === 'fechas') {
    if (hasta && hasta < sesion) return { tipo: 'fechas', texto: `El periodo termina el ${fechaCorta(hasta)} porque elegiste ${nombreModo}.`, ayuda: AYUDA_FECHAS }
  } else if (modo !== 'hoy') return null
  if (!ultima) return null
  const semanal = intervalo === 'semanal' || intervalo === 'w' || intervalo === '1wk'
  const esperada = semanal ? ultimaSemanaCerrada(hoy) : sesion
  if (ultima >= esperada) return null
  return { tipo: 'faltan', texto: `Faltan velas: los precios de ${simbolo} llegan hasta ${semanal ? 'la semana del' : 'el'} ${fechaCorta(ultima)}.`, ayuda: AYUDA_FALTAN }
}
