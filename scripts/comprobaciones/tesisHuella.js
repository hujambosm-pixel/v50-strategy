// scripts/comprobaciones/tesisHuella.js — la huella de los datos de Sergi que «Imágenes y adjuntos» no puede cambiar (docs/tesis.md): todas las filas de
// tesis_inversion (título, texto, estado, relacionados y fechas), planes_inversion y strategies, en SOLO LECTURA. Uso: node scripts/comprobaciones/tesisHuella.js
// Imprime una línea por tabla (filas y md5) y una por tesis (id, bytes del texto y md5); se compara a mano o con diff, antes y después.
const { consulta } = require('../universoNasdaq100')
const fila = (t, orden) => `SELECT '${t}' AS tabla, count(*)::text AS filas, md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' ORDER BY ${orden}), '')) AS huella FROM public.${t} x`
;(async () => {
  const q = `BEGIN READ ONLY; SET LOCAL extra_float_digits = 1; SELECT json_build_object(
    'tablas', (SELECT json_agg(r) FROM (${fila('tesis_inversion', 'x.id')} UNION ALL ${fila('planes_inversion', 'x.id')} UNION ALL ${fila('strategies', 'x.id')}) r),
    'tesis', (SELECT json_agg(json_build_object('id', id, 'titulo', titulo, 'bytes', octet_length(texto), 'md5', md5(to_jsonb(x)::text)) ORDER BY id) FROM public.tesis_inversion x)) AS d;`
  const d = (await consulta(q)).find?.(x => x.d)?.d ?? (await consulta(q))[0].d
  for (const t of d.tablas) console.log(`${t.tabla}: ${t.filas} filas · ${t.huella}`)
  for (const t of d.tesis || []) console.log(`  tesis ${t.id} · ${t.bytes} bytes · ${t.md5} · ${t.titulo}`)
})().catch(e => { console.error(e.message || e); process.exit(1) })
