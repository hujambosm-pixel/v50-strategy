// lib/velasSemanales.js — las velas semanales se CONSTRUYEN a partir de las diarias.
//
// POR QUÉ. Yahoo, con interval=1wk, devuelve DOS velas para la última semana: la del lunes, agregada,
// y otra fechada en el último día negociado que contiene solo ese día. Comprobado en los tres símbolos
// de referencia: 1.045 velas semanales, de las que `2026-09-28` aparece dos veces —una fechada en su
// lunes y otra en el viernes `2026-10-02`, con otro open y otro low—. El motor tomaba la segunda como
// una semana más, así que la última «semana» del histórico era en realidad un día, y la decisión del
// bucle para la última barra se tomaba con la vela del lunes de LA MISMA semana. Era el único salto
// distinto de 7 días en toda la serie.
//
// Construyéndolas desde las diarias no hay duplicados posibles: una semana es una clave, y la clave es
// su lunes. De paso se gana que el open, el high, el low, el close y el volumen de cada semana salen de
// los mismos datos que el backtest diario, así que las dos temporalidades dejan de poder divergir.
//
// COMPROBADO contra las semanales de Yahoo en todo el histórico disponible (20 años, ^GSPC, AAPL y
// NVDA): 1.043 de 1.043 semanas cerradas coinciden en open, high, low y close. La única diferencia está
// en la PRIMERA semana de la serie, y no es un fallo: la serie diaria empieza un martes, así que a esa
// semana le faltan los días anteriores al inicio de la descarga y su open es el del martes. Yahoo, que
// ve más historia, usa el del lunes. Se resuelve solo pidiendo un poco más de histórico diario del que
// se va a usar —datos.js ya pide `years + 1` y recorta después—, y en cualquier caso afecta a una sola
// semana, la más antigua de la descarga.
//
// NO hace falta descargar más histórico para cubrir el mismo rango: la diaria a 20 años son ~5.031
// velas y sigue siendo diaria (cero huecos de más de 5 días), así que el mismo rango de calendario
// cubre exactamente las mismas semanas.

// Lunes de la semana de una fecha, en UTC. Es la clave de agrupación y la fecha de la vela, igual que
// hace Yahoo: una semana se fecha en su lunes aunque el lunes sea festivo y no haya sesión.
export function lunesDeSemana(fecha) {
  const d = new Date(String(fecha) + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  const dow = d.getUTCDay()                 // 0 domingo … 6 sábado
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

// Agrega una serie diaria en semanas de lunes a viernes.
//   open    del primer día con sesión de la semana
//   high    el máximo de la semana
//   low     el mínimo de la semana
//   close   del último día con sesión
//   volume  la suma
//   date    el lunes de esa semana
// `sesiones` dice cuántos días la componen: una semana con menos de 5 es festiva, truncada por el
// principio de la descarga o la semana en curso. No se usa para decidir nada —eso sería cambiar el
// comportamiento de las estrategias—, pero queda ahí para quien lo necesite.
// Las barras tienen que llegar ordenadas por fecha, que es como las sirve el proveedor.
// `opciones.semanaEnCurso(lunes)` permite a quien llama marcar la última semana como no cerrada.
// Una semana está en curso si lo dice esa función —el viernes todavía no ha cerrado— o si alguna de
// sus velas diarias viene con `enCurso`. El campo solo aparece cuando es true, para que una serie
// con el mercado cerrado siga siendo byte a byte la de siempre.
export function semanalesDesdeDiarias(diarias, opciones = {}) {
  if (!Array.isArray(diarias) || !diarias.length) return []
  const enCursoDe = typeof opciones.semanaEnCurso === 'function' ? opciones.semanaEnCurso : () => false
  const out = []
  let actual = null
  let diariaAbierta = false
  for (const b of diarias) {
    if (!b || b.close == null || isNaN(b.close)) continue
    const lunes = lunesDeSemana(b.date)
    if (lunes == null) continue
    if (!actual || actual.date !== lunes) {
      if (actual) out.push(actual)
      diariaAbierta = !!b.enCurso
      actual = {
        date: lunes,
        open: b.open ?? b.close, high: b.high ?? b.close, low: b.low ?? b.close, close: b.close,
        volume: Number(b.volume) || 0,
        sesiones: 1,
      }
      continue
    }
    if (b.enCurso) diariaAbierta = true
    const hi = b.high ?? b.close, lo = b.low ?? b.close
    if (hi != null && hi > actual.high) actual.high = hi
    if (lo != null && lo < actual.low) actual.low = lo
    actual.close = b.close
    actual.volume += Number(b.volume) || 0
    actual.sesiones++
  }
  if (actual) out.push(actual)
  if (out.length) {
    const ultima = out[out.length - 1]
    if (diariaAbierta || enCursoDe(ultima.date) === true) out[out.length - 1] = { ...ultima, enCurso: true }
  }
  return out
}

export default semanalesDesdeDiarias
