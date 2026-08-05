-- =============================================================
-- ranking_results: limpiar valores CENTINELA (-99)
-- Ejecutar en Supabase SQL Editor
-- =============================================================
--
-- QUÉ ES -99
-- Cuando el capital final de un backtest queda en 0 o negativo, el cálculo del CAGR
-- no tiene sentido matemático y la app devuelve el valor centinela -99:
--
--   cagr        = capFinal > 0 ? (...) : -99
--   cagrRobusto = capRob   > 0 ? (...) : -99      (CAGR excluyendo los 3 mejores trades)
--
-- -99 significa "no calculable", NO "-99% de rentabilidad".
--
-- POR QUÉ HAY QUE LIMPIARLO
-- El score del ranking normaliza cada métrica por PERCENTILES del conjunto de filas.
-- Al guardarse el centinela como número, hundía el suelo de la distribución (la mayoría
-- de las filas valían exactamente -99), de modo que cualquier valor real quedaba por
-- encima del techo y se clampaba a 100 — o, si casi todas eran -99, suelo y techo
-- coincidían y todas recibían un 50 neutro. En ambos casos la métrica dejaba de
-- discriminar y el score guardado no coincidía con el recalculado.
--
-- A partir de ahora la app ya NO escribe -99 (lo persiste como NULL) y además lo excluye
-- del cálculo de percentiles. Estas sentencias limpian lo ya escrito.
--
-- Con NULL, el score aplica el fallback que ya existía: usa el CAGR normal en lugar del
-- robusto, y descarta la fila del universo de percentiles. Nada se rompe.

-- ─────────────────────────────────────────────────────────────
-- PASO 1: CAGR robusto no calculable → NULL
-- ─────────────────────────────────────────────────────────────
UPDATE ranking_results
   SET cagr_robusto = NULL
 WHERE cagr_robusto <= -99;

-- ─────────────────────────────────────────────────────────────
-- PASO 2: CAGR simple no calculable → NULL
-- ─────────────────────────────────────────────────────────────
UPDATE ranking_results
   SET cagr_simple = NULL
 WHERE cagr_simple <= -99;

-- ─────────────────────────────────────────────────────────────
-- COMPROBACIÓN (opcional): no debe quedar ningún centinela y el
-- rango de cada métrica debe volver a ser realista.
-- ─────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE cagr_simple  <= -99) AS centinelas_cagr,
--        count(*) FILTER (WHERE cagr_robusto <= -99) AS centinelas_robusto,
--        min(cagr_robusto) AS min_robusto, max(cagr_robusto) AS max_robusto,
--        min(cagr_simple)  AS min_cagr,    max(cagr_simple)  AS max_cagr
--   FROM ranking_results;
