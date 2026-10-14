// scripts/generaScreener.js — rellena public.universo_screener (sql/universo_screener.sql) con lib/screener.js.
//
//   node scripts/generaScreener.js --ensayo        hace la escritura entera y termina en ROLLBACK: dice qué cambiaría
//   node scripts/generaScreener.js                 escribe (una transacción) y comprueba lo escrito leyéndolo de vuelta
//   node scripts/generaScreener.js --revertir <md5>   borra las filas de la regla SOLO si su huella es la dada (la que
//                                                  imprime la escritura); si alguien las cambió después, no toca nada
//   opciones: --regla volatilidad|momentum (por defecto volatilidad) · --universo NDX · --n 10,20,30 · --desde 2016 ·
//             --hasta 2026
//
// Reglas (REGLAS de lib/screener.js, sobre universo_miembros y los cierres de precios_diarios):
//   · «volatilidad»: las mismas selecciones que scripts/informeScreener.js;
//   · «momentum» (Fase 8a, paso 4): rentabilidad de 12 meses completos hasta el último día de bolsa del año anterior.
// La columna «volatilidad» guarda la MEDIDA de la regla (la volatilidad o el momentum). Reescribe TODAS las filas de esa
// regla para esos N (DELETE + INSERT en la misma transacción) y deja la tabla igual que lo calculado o no la toca; las
// filas de las demás reglas no se tocan, y se comprueba con su huella antes y después.
//
// Huella: md5 de las filas de la regla, en orden (n, anio, posicion), con la medida en su texto exacto.
// Lee y escribe por la Management API, como los demás scripts del universo.
const { consulta } = require('./universoNasdaq100')
const { leeCierres } = require('./coberturaUniverso')
const { preparaEsm } = require('./guardian/cargaEsm')
const NL = String.fromCharCode(10)

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
// extra_float_digits = 1 en todas las transacciones: la volatilidad viaja y se huella con su representación exacta (la
// conexión de la Management API trae 0, que la redondea a 15 cifras).
const EXACTO = 'SET LOCAL extra_float_digits = 1;'
const lee = (q) => consulta('BEGIN READ ONLY;' + NL + EXACTO + NL + q + NL + 'ROLLBACK;')
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const REGLA = opcion('--regla', 'volatilidad')
const huellaDe = (regla) => `SELECT md5(coalesce(string_agg(n || '|' || anio || '|' || posicion || '|' || simbolo_yahoo || '|' || coalesce(volatilidad::text, ''), ',' ORDER BY n, anio, posicion), '')) AS h,
  count(*)::int AS filas FROM public.universo_screener WHERE regla = ${lit(regla)}`
const HUELLA = huellaDe(REGLA)
// Huella de las filas de las OTRAS reglas (tienen que quedar intactas).
const HUELLA_OTRAS = `SELECT md5(coalesce(string_agg(regla || '|' || n || '|' || anio || '|' || posicion || '|' || simbolo_yahoo || '|' || coalesce(volatilidad::text, ''), ',' ORDER BY regla, n, anio, posicion), '')) AS h,
  count(*)::int AS filas FROM public.universo_screener WHERE regla <> ${lit(REGLA)}`

;(async () => {
  const REVERTIR = opcion('--revertir')
  if (REVERTIR) {
    // Guardia: la huella se calcula DENTRO de la transacción del borrado; si no coincide, la excepción deshace todo.
    const r = await consulta(`BEGIN; ${EXACTO}
      DO $$ DECLARE h text; BEGIN
        SELECT md5(coalesce(string_agg(n || '|' || anio || '|' || posicion || '|' || simbolo_yahoo || '|' || coalesce(volatilidad::text, ''), ',' ORDER BY n, anio, posicion), ''))
          INTO h FROM public.universo_screener WHERE regla = ${lit(REGLA)};
        IF h IS DISTINCT FROM ${lit(REVERTIR)} THEN RAISE EXCEPTION 'huella distinta (%): no se borra nada', h; END IF;
        DELETE FROM public.universo_screener WHERE regla = ${lit(REGLA)};
      END $$;
      COMMIT;
      ${HUELLA};`)
    console.log(`Revertido: la regla «${REGLA}» queda con ${r[0].filas} filas.`)
    return
  }
  const UNIVERSO = opcion('--universo', 'NDX')
  const NS = opcion('--n', '10,20,30').split(',').map(Number)
  const DESDE = Number(opcion('--desde', 2016)), HASTA = Number(opcion('--hasta', 2026))
  const ENSAYO = args.includes('--ensayo')
  await preparaEsm()
  const { REGLAS } = require('../lib/screener')
  const regla = REGLAS[REGLA]
  if (!regla) { console.error(`Regla desconocida: «${REGLA}» (hay: ${Object.keys(REGLAS).join(', ')}).`); process.exit(1) }

  const miembros = await lee(`SELECT simbolo, simbolo_yahoo, nombre, desde::text, hasta::text, motivo_salida, excluido_motivo
    FROM public.universo_miembros WHERE indice = ${lit(UNIVERSO)} ORDER BY desde, simbolo;`)
  if (!miembros.length) { console.error(`El universo «${UNIVERSO}» no existe.`); process.exit(1) }
  const simbolos = [...new Set(miembros.map(t => t.simbolo_yahoo).filter(Boolean))].sort()
  const velas = await leeCierres(lee, simbolos, `${DESDE - 2}-01-01`)

  const filas = []
  for (const N of NS) for (let y = DESDE; y <= HASTA; y++)
    regla(y, N, miembros, velas).seleccionados.forEach((x, i) => filas.push({ n: N, anio: y, simbolo_yahoo: x.simbolo, posicion: i + 1, volatilidad: REGLA === 'momentum' ? x.momentum : x.vol }))
  // String(número) es la representación exacta más corta: PostgreSQL la lee como el mismo float8.
  const valores = filas.map(f => `(${lit(REGLA)}, ${f.n}, ${f.anio}, ${lit(f.simbolo_yahoo)}, ${f.posicion}, ${f.volatilidad == null ? 'NULL' : String(f.volatilidad)})`)
  const antes = (await lee(HUELLA + ';'))[0], otrasAntes = (await lee(HUELLA_OTRAS + ';'))[0]
  const r = await consulta(`BEGIN; ${EXACTO}
    DELETE FROM public.universo_screener WHERE regla = ${lit(REGLA)} AND n = ANY(ARRAY[${NS.join(',')}]::int[]);
    INSERT INTO public.universo_screener (regla, n, anio, simbolo_yahoo, posicion, volatilidad) VALUES
    ${valores.join(',' + NL + '    ')};
    SELECT a.h, a.filas, b.h AS h_otras, b.filas AS filas_otras FROM (${HUELLA}) a, (${HUELLA_OTRAS}) b;
    ${ENSAYO ? 'ROLLBACK' : 'COMMIT'};`)
  const despues = r[0]
  console.log(`universo_screener · regla «${REGLA}» · N = ${NS.join(', ')} · años ${DESDE}–${HASTA}: ${filas.length} filas calculadas`)
  console.log(`   antes: ${antes.filas} filas, huella ${antes.h} · ${ENSAYO ? 'quedaría' : 'queda'}: ${despues.filas} filas, huella ${despues.h}`
    + (antes.h === despues.h ? ' (IDÉNTICA: no cambia nada)' : ''))
  console.log(`   otras reglas: ${otrasAntes.filas} filas, huella ${otrasAntes.h} · ${ENSAYO ? 'quedaría' : 'queda'}: ${despues.filas_otras} filas, huella ${despues.h_otras}`
    + (otrasAntes.h === despues.h_otras ? ' (INTACTAS)' : ' ¡CAMBIAN!'))
  if (otrasAntes.h !== despues.h_otras) process.exit(1)
  if (ENSAYO) { console.log('   ENSAYO: ROLLBACK, la tabla no ha cambiado.'); return }

  // Comprobación: lo escrito, leído de vuelta, es exactamente lo calculado (volatilidad incluida, bit a bit).
  const leidas = await lee(`SELECT n, anio, simbolo_yahoo, posicion, volatilidad FROM public.universo_screener WHERE regla = ${lit(REGLA)}
    AND n = ANY(ARRAY[${NS.join(',')}]::int[]) ORDER BY n, anio, posicion;`)
  const clave = (f) => `${f.n}|${f.anio}|${f.posicion}|${f.simbolo_yahoo}|${f.volatilidad}`
  const ok = leidas.length === filas.length && leidas.every((f, i) => clave(f) === clave(filas[i]))
  console.log(`   comprobación: ${ok ? 'lo leído coincide con lo calculado fila a fila' : '¡NO COINCIDE!'} · para revertir: node scripts/generaScreener.js --regla ${REGLA} --revertir ${despues.h}`)
  if (!ok) process.exit(1)
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
