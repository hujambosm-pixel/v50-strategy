// lib/planes/ociosoRegla.js — el DINERO OCIOSO CON SU PROPIA REGLA (docs/builder.md §203; boceto bocetos/ocioso-con-regla.html; decisiones
// de Sergi del 19/11). Campo opcional de una pieza «estrategia»:
//   ociosoRegla: { filas: [{ quien, si, velas? }, …], siNo: 'LIQUIDEZ' | símbolo }
//   · filas: condiciones del catálogo (las mismas filas que las reglas del bloque «Con pesos», lib/planes/pesos.js), TODAS a la vez («Y»).
//   · Mientras se cumplen, el dinero ocioso está en su símbolo (pieza.ocioso); si no, en siNo (la liquidez u otro símbolo).
//   · Se mira al cierre y actúa a la apertura siguiente (una fila semanal se conoce al cierre de la última sesión de la semana).
//   · Con varios bloques el ocioso es de la cuenta: la regla, la misma en todos los bloques de estrategia.
// Sin el campo, el ocioso de siempre (siempre en su símbolo): ninguna cifra cambia.
import { validaFilas } from './pesos'

const simboloOk = (s) => typeof s === 'string' && /^[A-Za-z0-9.^=-]{1,15}$/.test(s) && !['LIQUIDEZ', 'ETF'].includes(s)

export function validaOciosoRegla(x) {
  const r = x?.ociosoRegla
  if (r === undefined) return []
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['la regla del dinero ocioso no es válida.']
  const e = []
  if (!x.ocioso || x.ocioso === 'LIQUIDEZ') e.push('con el dinero ocioso en liquidez no hace falta regla: elige dónde espera (oro, QQQ…).')
  if (!(r.siNo === 'LIQUIDEZ' || simboloOk(r.siNo))) e.push('«Si no se cumple»: la liquidez o un símbolo.')
  else if (r.siNo === x.ocioso) e.push('«Si no se cumple» tiene que ser distinto de donde espera el dinero ocioso.')
  else if (r.siNo === x.activo) e.push('«Si no se cumple» no puede ser el valor de la estrategia.')
  e.push(...validaFilas(r.filas, 'La regla del dinero ocioso'))
  if (Array.isArray(r.filas) && r.filas.some((f, k) => k > 0 && f?.union !== 'Y')) e.push('La regla del dinero ocioso: todas sus condiciones van con «Y».')
  return e
}
// Los símbolos que miran sus condiciones.
export const simbolosFilasOcioso = (x) => (x?.ociosoRegla?.filas || []).map(f => f?.quien).filter(Boolean)
// Los símbolos cuyas velas necesita la regla: el de «si no se cumple» (salvo la liquidez) y los que miran sus condiciones.
export const simbolosOciosoRegla = (x) => !x?.ociosoRegla ? [] : [...new Set([...(simboloOk(x.ociosoRegla.siNo) ? [x.ociosoRegla.siNo] : []), ...simbolosFilasOcioso(x)])]
// La pieza sin la regla del ocioso (las referencias «el mismo plan con el ocioso en liquidez» y «… siempre dentro»).
export const sinReglaOcioso = (x) => { if (!x || x.ociosoRegla === undefined) return x; const { ociosoRegla, ...resto } = x; return resto }
