// lib/screener/splits.js — SPLITS: de lo que da Yahoo a public.precios_splits y cómo se ajustan con ellos las acciones de la SEC
// (sql/precios_splits.sql, docs/screener.md §25). Lógica PURA: no habla con la red ni con la base.
//
// Los precios de Yahoo están ajustados por todos los splits (hasta hoy). Las acciones de la SEC están en las acciones que había el
// día en que se presentó su documento (`presentado`). Para ponerlas en la escala de los precios se multiplican por los splits
// POSTERIORES a ese día:
//   AAPL 2017: 5.252 millones, presentado el 31/10/2019; después, el 4:1 del 31/08/2020 → 5.252 × 4 = 21.008 millones.
//   NVDA 2019: 625 millones, presentado el 26/02/2021; después, 4:1 (20/07/2021) y 10:1 (10/06/2024) → 625 × 40 = 25.000.
// Un split del MISMO día en que se presentó el documento no cuenta (se supone que el documento aún no lo recoge).

const FECHA = /^\d{4}-\d{2}-\d{2}$/

// events.splits del chart v8 de Yahoo ({ "<epoch>": { date, numerator, denominator, splitRatio } }) → [[fecha, num, den], …]
// ordenada por fecha. Descarta lo que no sea un número positivo y los «splits» 1:1. Fecha en UTC (Yahoo la da a las 13:30 UTC).
export function splitsDeYahoo(events) {
  const lista = []
  for (const x of Object.values(events?.splits || {})) {
    let n = Number(x?.numerator), d = Number(x?.denominator)
    if (!(n > 0 && d > 0) && typeof x?.splitRatio === 'string') { const m = x.splitRatio.match(/^\s*([\d.]+)\s*[:/]\s*([\d.]+)\s*$/); if (m) { n = Number(m[1]); d = Number(m[2]) } }
    if (!(n > 0 && d > 0) || !Number.isFinite(n) || !Number.isFinite(d) || n === d) continue
    const t = Number(x?.date); if (!Number.isFinite(t)) continue
    lista.push([new Date(t * 1000).toISOString().slice(0, 10), n, d])
  }
  lista.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  return lista.filter((s, i) => i === 0 || s[0] !== lista[i - 1][0])   // dos el mismo día: el primero
}

// Lo que hay que multiplicar a unas acciones contadas el día `fecha` para ponerlas en la escala de hoy (la de los precios).
export function factorDesde(splits, fecha) {
  if (!FECHA.test(String(fecha || ''))) return 1
  let f = 1
  for (const [dia, n, d] of splits || []) if (dia > fecha) f *= Number(n) / Number(d)
  return f
}

// Lo mismo, pero solo con los splits entre `desde` (sin contar ese día) y `hasta` (contándolo): para el precio de un día
// concreto SIN ajustar (el `precio` de screener_empresas, del día `precio_fecha`). Sin `hasta` válido, hasta hoy.
export function factorEntre(splits, desde, hasta) {
  if (!FECHA.test(String(desde || ''))) return 1
  const tope = FECHA.test(String(hasta || '')) ? hasta : '9999-12-31'
  let f = 1
  for (const [dia, n, d] of splits || []) if (dia > desde && dia <= tope) f *= Number(n) / Number(d)
  return f
}

// Las acciones de una fila de screener_cuentas en la escala de los precios de Yahoo.
export const accionesAjustadas = (valor, presentado, splits) => valor == null ? null : Number(valor) * factorDesde(splits, presentado)
