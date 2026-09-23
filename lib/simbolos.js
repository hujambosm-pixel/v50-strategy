// lib/simbolos.js — traducción del símbolo canónico de la app (el de Yahoo, que es el que guarda la
// watchlist) al espacio de nombres de Stooq.
//
// PRINCIPIO, y es el que gobierna toda la función: ANTE LA DUDA, FALLAR. Devolver `null` hace que quien
// llama caiga al respaldo de Yahoo, que entiende el símbolo canónico. Devolver un símbolo que existe pero
// es OTRO instrumento no falla nunca, no avisa nunca y produce un backtest silenciosamente equivocado —que
// es exactamente lo que llevaba pasando con ASML y con el S&P 500—.
//
// Esta tabla vivía copiada en tres sitios (datos.js, status.js y tradelog.js) con contenidos distintos: la
// de tradelog no tenía ninguna regla y la de status tenía seis entradas menos. Ahora es una sola.

// Equivalencias verificadas, una por una. Solo entran las que apuntan al MISMO instrumento.
export const STOOQ_MAP = {
  // Índices europeos y asiáticos: espacios de nombres propios por bolsa, sin ambigüedad.
  '^IBEX':     'ibex.es',
  '^GDAXI':    'dax.de',
  '^FTSE':     'ftse.uk',
  '^N225':     'n225.jp',
  '^FCHI':     'cac.fr',
  '^STOXX50E': 'sx5e.de',
  '^HSI':      'hsi.hk',
  // Cripto: el espacio `.v` de Stooq.
  'BTC-USD':   'btc-usd.v',
  'ETH-USD':   'eth-usd.v',
  // Futuros: el espacio `.f`.
  'GC=F':      'gc.f',
  'CL=F':      'cl.f',
  'SI=F':      'si.f',
  // ── FUERA a propósito, no por olvido ──────────────────────────────────────────────────────────
  // '^GSPC': 'spy.us'  → spy.us es el ETF SPY, no el índice, y además va ajustado por dividendos. Como
  //                      alimenta el filtro de mercado y el benchmark B&H de TODOS los backtests, el
  //                      sesgo se colaba en todas partes. Sin equivalencia verificada del índice en
  //                      Stooq, se prefiere que falle y lo sirva Yahoo, que sí tiene ^GSPC.
  // '^NDX' y '^IXIC': ambos apuntaban a 'ndx.us'. Son dos índices distintos —Nasdaq 100 y Nasdaq
  //                      Composite—, así que como mucho uno de los dos podía ser correcto y no hay forma
  //                      de saber cuál sin comprobarlo contra el proveedor. Los dos fallan.
  // '^DJI': 'dji.us'  → se mantiene abajo porque no está demostrado que sea incorrecto, pero comparte
  //                      patrón con spy.us (índice servido desde el espacio .us) y merece verificación.
  '^DJI':      'dji.us',
}

// Pares de cripto reconocidos: son los únicos guiones que deben ir al espacio `.v`. La regla antigua
// mandaba allí CUALQUIER símbolo con guion, así que una clase de acción como BRK-B acababa en el espacio
// de divisas y cripto — un sitio donde, si existe algo, no es esa acción.
const MONEDAS_CRIPTO = ['USD', 'USDT', 'EUR', 'BTC', 'ETH', 'GBP']

/**
 * @returns {string|null} símbolo de Stooq, o `null` si no hay equivalencia segura.
 */
export function stooqSym(symbol) {
  if (typeof symbol !== 'string' || !symbol) return null
  const s = symbol.trim()
  if (!s) return null
  if (STOOQ_MAP[s]) return STOOQ_MAP[s]

  // Sufijo de bolsa (XSPS.L, ASML.AS): la regla de antes les pegaba '.us' ENCIMA del sufijo y producía
  // 'xsps.l.us', que no es nada. Fallan.
  if (s.includes('.')) return null

  // Índice fuera de la tabla: no hay espacio de nombres fiable para índices en Stooq, y colgarle '.us'
  // puede dar con una acción que se llame igual. Falla.
  if (s.startsWith('^')) return null

  // Futuros: el espacio '.f' con la raíz del contrato. Namespace correcto y raíz correcta; si el contrato
  // no existe, Stooq no devuelve datos y se cae al respaldo, que es el comportamiento deseado.
  if (s.endsWith('=F')) return s.replace('=F', '').toLowerCase() + '.f'

  // Guion: solo si es un par de cripto reconocido. El resto —clases de acción, tickers con guion— falla.
  if (s.includes('-')) {
    const moneda = s.split('-').pop().toUpperCase()
    return MONEDAS_CRIPTO.includes(moneda) ? s.toLowerCase() + '.v' : null
  }

  // Acción sin adornos. AVISO CONOCIDO y NO resuelto aquí: un ADR o un valor con doble cotización —ASML
  // es el caso vivo— también cae aquí y Stooq devuelve algo, que puede no ser la misma serie que Yahoo.
  // Distinguirlo exige comparar las dos series, no mirar el símbolo: ASML y AAPL tienen la misma forma.
  return s.toLowerCase() + '.us'
}
