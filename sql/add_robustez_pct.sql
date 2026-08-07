-- =============================================================
-- ranking_results: añadir robustez_pct
-- Ejecutar en Supabase SQL Editor
-- =============================================================
--
-- QUÉ MIDE
-- Qué porcentaje de las ganancias NO depende del mejor trade:
--
--   robustez = 100 − (mejor trade / suma de trades ganadores) × 100
--
-- El denominador es el beneficio BRUTO (suma de los pnlSimple positivos), que siempre
-- es >= el mejor trade, así que el resultado cae de forma natural en [0,100) sin recortes.
-- Si el beneficio NETO de la estrategia es <= 0, vale 0: una estrategia perdedora no es robusta.
--
-- Un valor ALTO = beneficio repartido entre varias operaciones (sólido).
-- Un valor BAJO = casi todo el beneficio viene de una sola operación (frágil).
--
-- POR QUÉ SUSTITUYE AL "CAGR SIN TOP 3 TRADES"
-- La métrica anterior (columna cagr_robusto) restaba los 3 mejores trades manteniendo el
-- capital base, así que se saturaba en cuanto la ganancia estaba concentrada: la mayoría
-- de las filas acababan en el centinela -99 ("no calculable") y la mediana real era de
-- -3,5% (activa) y -0,1% (top). Dejaba de discriminar.
--
-- La columna cagr_robusto NO se toca: se conserva como histórico, pero deja de escribirse.
-- Mientras robustez_pct esté vacía, la app degrada con elegancia (el componente queda
-- marcado como no disponible) hasta que se ejecute una actualización completa de métricas.

ALTER TABLE ranking_results
  ADD COLUMN IF NOT EXISTS robustez_pct numeric;
