-- =============================================================
-- ranking_results: añadir cagr_robusto
-- Ejecutar en Supabase SQL Editor
-- =============================================================
--
-- CAGR excluyendo los 3 mejores trades (métrica "robusta"). Hasta ahora solo se
-- calculaba en memoria durante la corrida y NO se guardaba, así que al recargar la
-- app el score la sustituía por el CAGR normal (fallback cagrRobust ?? cagr) y la
-- puntuación cambiaba respecto a la de la corrida.
--
-- La columna nace vacía (NULL): el fallback sigue activo para las filas antiguas y
-- se va rellenando conforme se actualizan métricas desde la app.

ALTER TABLE ranking_results
  ADD COLUMN IF NOT EXISTS cagr_robusto numeric;
