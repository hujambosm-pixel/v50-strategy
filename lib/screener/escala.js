// lib/screener/escala.js — ESCALA DE LAS ACCIONES de la SEC (docs/screener.md §26). Lógica PURA: no habla con la red ni con la base.
//
// Algunas empresas declaran a la SEC el número de acciones en MILES o en MILLONES en vez de en acciones sueltas (la etiqueta
// XBRL dice «shares», pero el número es el de la tabla del informe, «en millones»). Ejemplo: MCD 2025 = 716,4 (son 716,4
// millones); NVMI 2025 = 32.800 (son 32,8 millones). Sin arreglarlo, la capitalización sale un millón o mil veces más pequeña
// y el PER, casi 0: la empresa pasa los filtros de «barato» por error.
//
// CÓMO SE DETECTA, para cada fila de acciones (concepto acciones_diluidas):
//   1) Con el BPA del mismo periodo: acciones esperadas = beneficio neto ÷ BPA diluido (mismo fin y mismo tipo de periodo).
//      Ejemplo MCD 2025: beneficio 8.563 millones $, BPA 11,95 $ → 716,6 millones de acciones esperadas; declara 716,4 →
//      716,4 ÷ 716.600.000 ≈ 1 / 1.000.000 → se multiplica por 1.000.000.
//   2) Si no hay BPA (o el beneficio es 0), con la mediana de las acciones de los demás periodos de la empresa.
//   Se corrige solo si la diferencia es, en potencias de 10, de 3 (miles) o 6 (millones) con un margen de ±0,5 (es decir,
//   entre 316 y 3.162 veces para «miles»). Un split (2:1, 4:1, 10:1, 20:1…) nunca llega a ese margen: no se confunde.
// Una fila corregida lleva en `escala` el factor aplicado (1.000 o 1.000.000; no se guarda en la base: scripts/cargaScreener.js
// solo lo cuenta); las demás no lo llevan. Se aplica al leer los datos de la SEC (lib/screener/edgar.js, filasDeEmpresa).

const ACCIONES = 'acciones_diluidas'
const log = (x) => Math.log10(Math.abs(x))

// Factor (1, 1e3, 1e6, 1e-3…) que hay que multiplicar a `valor` para acercarlo a `referencia`, o 1 si no es un salto de escala.
export function factorEscala(valor, referencia) {
  const v = Number(valor), r = Number(referencia)
  if (!(v > 0) || !(Math.abs(r) > 0) || !Number.isFinite(v) || !Number.isFinite(r)) return 1
  const d = log(r) - log(v)              // cuántas potencias de 10 le faltan
  const k = Math.round(d / 3)
  if (k === 0 || Math.abs(k) > 2 || Math.abs(d - 3 * k) > 0.5) return 1
  return Math.pow(10, 3 * k)
}

// Corrige las filas de acciones de UNA empresa (filas con { concepto, periodo, fin, valor }); devuelve las filas nuevas (las
// demás, tal cual). No cambia el orden. Las filas de acciones corregidas llevan `escala` y el valor ya multiplicado.
export function corrigeEscalaAcciones(filas) {
  const lista = filas || []
  const clave = (f) => f.periodo + '|' + f.fin
  const ben = new Map(), bpa = new Map()
  for (const f of lista) {
    if (f.concepto === 'beneficio_neto') ben.set(clave(f), Number(f.valor))
    else if (f.concepto === 'bpa_diluido') bpa.set(clave(f), Number(f.valor))
  }
  const acc = lista.filter(f => f.concepto === ACCIONES && Number(f.valor) > 0)
  if (!acc.length) return lista
  // 1.º paso: con el BPA. 2.º paso: con la mediana de las acciones ya revisadas en el 1.º (más fiable que la de las crudas).
  const porBpa = new Map()
  for (const f of acc) {
    const b = ben.get(clave(f)), e = bpa.get(clave(f))
    if (b && e && Math.abs(e) >= 0.01) porBpa.set(f, factorEscala(f.valor, b / e))
  }
  const revisadas = acc.map(f => Number(f.valor) * (porBpa.get(f) ?? 1)).map(log).sort((a, b) => a - b)
  const mediana = Math.pow(10, revisadas[revisadas.length >> 1])
  return lista.map(f => {
    if (f.concepto !== ACCIONES || !(Number(f.valor) > 0)) return f
    let k = porBpa.has(f) ? porBpa.get(f) : factorEscala(f.valor, mediana)
    // Con el BPA no se ve salto pero la serie sí lo ve muy claro (el propio BPA puede venir mal): manda la serie si las dos
    // referencias no coinciden y el valor está a más de 2,5 potencias de 10 de la mediana.
    if (k === 1 && porBpa.has(f) && Math.abs(log(mediana) - log(f.valor)) > 2.5) k = factorEscala(f.valor, mediana)
    if (k === 1) return f
    return { ...f, valor: Number(f.valor) * k, escala: k }
  })
}
