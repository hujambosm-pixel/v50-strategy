-- sql/screener_tecnico_ema.sql — el screener guarda también la EMA 50 y la EMA 20 (docs/screener.md §16).
--
-- QUÉ. guardar_tecnico_screener (sql/screener_tecnico.sql) solo guarda unas claves concretas de la columna `tecnico`. Se añaden
-- `ema50` y `ema20` (números ≥ 0, como `ema200`) a las dos listas: la de las que se comprueban y la de las que se guardan.
-- Nada más cambia: ni la tabla, ni los permisos (CREATE OR REPLACE los conserva), ni las demás comprobaciones.
-- POR QUÉ. Los filtros «Precio frente a la EMA 50» y «… EMA 20» (pedidos por Sergi el 11/11) necesitan esas dos medias.
--
-- REVERSIÓN (la función de antes, sin ema50 ni ema20; lo guardado de más se queda en la columna y no molesta):
--   CREATE OR REPLACE FUNCTION public.guardar_tecnico_screener(p_simbolo text, p_tecnico jsonb)
--   RETURNS boolean
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $$
--   DECLARE
--     k text;
--     x numeric;
--   BEGIN
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'guardar_tecnico_screener: hace falta un usuario autenticado';
--     END IF;
--     IF p_simbolo IS NULL OR p_simbolo !~ '^[A-Z0-9.^=-]{1,20}$' THEN
--       RAISE EXCEPTION 'guardar_tecnico_screener: símbolo no válido (%)', p_simbolo;
--     END IF;
--     IF p_tecnico IS NULL OR jsonb_typeof(p_tecnico) IS DISTINCT FROM 'object' OR octet_length(p_tecnico::text) > 2048 THEN
--       RAISE EXCEPTION 'guardar_tecnico_screener: el técnico tiene que ser un objeto JSON de 2 KB como mucho';
--     END IF;
--     IF jsonb_typeof(p_tecnico->'fecha') IS DISTINCT FROM 'string' OR (p_tecnico->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$'
--        OR (p_tecnico->>'fecha')::date > (now() AT TIME ZONE 'UTC')::date THEN
--       RAISE EXCEPTION 'guardar_tecnico_screener: fecha no válida (%)', p_tecnico->>'fecha';
--     END IF;
--     IF jsonb_typeof(p_tecnico->'cierre') IS DISTINCT FROM 'number' OR (p_tecnico->>'cierre')::numeric <= 0 THEN
--       RAISE EXCEPTION 'guardar_tecnico_screener: cierre no válido (%)', p_tecnico->>'cierre';
--     END IF;
--     FOREACH k IN ARRAY ARRAY['ema200', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'] LOOP
--       IF p_tecnico ? k AND jsonb_typeof(p_tecnico->k) <> 'null' THEN
--         IF jsonb_typeof(p_tecnico->k) <> 'number' THEN
--           RAISE EXCEPTION 'guardar_tecnico_screener: % no es un número', k;
--         END IF;
--         x := (p_tecnico->>k)::numeric;
--         IF x < 0 THEN
--           RAISE EXCEPTION 'guardar_tecnico_screener: % negativo (%)', k, x;
--         END IF;
--       END IF;
--     END LOOP;
--     UPDATE public.screener_empresas
--        SET tecnico = (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(p_tecnico) e
--                        WHERE e.key IN ('fecha', 'cierre', 'ema200', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'))
--                      || jsonb_build_object('en', now())
--      WHERE simbolo = p_simbolo;
--     RETURN FOUND;
--   END;
--   $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.guardar_tecnico_screener(p_simbolo text, p_tecnico jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  x numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'guardar_tecnico_screener: hace falta un usuario autenticado';
  END IF;
  IF p_simbolo IS NULL OR p_simbolo !~ '^[A-Z0-9.^=-]{1,20}$' THEN
    RAISE EXCEPTION 'guardar_tecnico_screener: símbolo no válido (%)', p_simbolo;
  END IF;
  IF p_tecnico IS NULL OR jsonb_typeof(p_tecnico) IS DISTINCT FROM 'object' OR octet_length(p_tecnico::text) > 2048 THEN
    RAISE EXCEPTION 'guardar_tecnico_screener: el técnico tiene que ser un objeto JSON de 2 KB como mucho';
  END IF;
  IF jsonb_typeof(p_tecnico->'fecha') IS DISTINCT FROM 'string' OR (p_tecnico->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (p_tecnico->>'fecha')::date > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'guardar_tecnico_screener: fecha no válida (%)', p_tecnico->>'fecha';
  END IF;
  IF jsonb_typeof(p_tecnico->'cierre') IS DISTINCT FROM 'number' OR (p_tecnico->>'cierre')::numeric <= 0 THEN
    RAISE EXCEPTION 'guardar_tecnico_screener: cierre no válido (%)', p_tecnico->>'cierre';
  END IF;
  FOREACH k IN ARRAY ARRAY['ema200', 'ema50', 'ema20', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'] LOOP
    IF p_tecnico ? k AND jsonb_typeof(p_tecnico->k) <> 'null' THEN
      IF jsonb_typeof(p_tecnico->k) <> 'number' THEN
        RAISE EXCEPTION 'guardar_tecnico_screener: % no es un número', k;
      END IF;
      x := (p_tecnico->>k)::numeric;
      IF x < 0 THEN
        RAISE EXCEPTION 'guardar_tecnico_screener: % negativo (%)', k, x;
      END IF;
    END IF;
  END LOOP;
  UPDATE public.screener_empresas
     SET tecnico = (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(p_tecnico) e
                     WHERE e.key IN ('fecha', 'cierre', 'ema200', 'ema50', 'ema20', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'))
                   || jsonb_build_object('en', now())
   WHERE simbolo = p_simbolo;
  RETURN FOUND;
END;
$$;

COMMIT;
