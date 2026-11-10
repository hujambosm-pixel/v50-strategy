-- sql/screener_tecnico.sql — el piso TÉCNICO del screener (parte 2, fase 2a; docs/screener.md).
--
-- QUÉ. Una columna `tecnico` (jsonb) en public.screener_empresas con los precios que usan los filtros técnicos de cada empresa
-- (lib/screener/tecnico.js, tecnicoDe): { fecha, cierre, ema200, max52, volUlt, volMedio50, cierre3m, velas }, y la hora en que
-- se calculó (`en`, la pone la función). Las cifras de los filtros (distancia a la EMA 200, al máximo de 52 semanas, volumen
-- relativo, fuerza del sector) se calculan en la pantalla a partir de esto.
--
-- QUIÉN ESCRIBE. La tabla sigue SIN permisos de escritura para la app. La columna solo se escribe con
-- guardar_tecnico_screener (SECURITY DEFINER), que:
--   · exige un usuario autenticado (como guardar_velas: los precios de la caché ya los puede escribir cualquier usuario con
--     sesión, así que esto no abre nada nuevo);
--   · solo toca la columna `tecnico` de una empresa que YA está en el screener (no crea filas ni cambia otras columnas);
--   · valida el JSON: objeto, ≤ 2 KB, fecha válida y no futura, cierre > 0 y los demás números finitos y no negativos (o null).
-- Devuelve si la empresa estaba (false = no está en el screener: p. ej. SPY o un ETF de sector, que no se guardan aquí).
-- La carga desde el PC de Sergi (scripts/cargaScreener.js --tecnico) escribe por la Management API como siempre.
--
-- REVERSIÓN (no la usa nada más):
--   DROP FUNCTION public.guardar_tecnico_screener(text, jsonb);
--   ALTER TABLE public.screener_empresas DROP COLUMN tecnico;

ALTER TABLE public.screener_empresas ADD COLUMN tecnico jsonb;

CREATE FUNCTION public.guardar_tecnico_screener(p_simbolo text, p_tecnico jsonb)
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
  FOREACH k IN ARRAY ARRAY['ema200', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'] LOOP
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
                     WHERE e.key IN ('fecha', 'cierre', 'ema200', 'max52', 'volUlt', 'volMedio50', 'cierre3m', 'velas'))
                   || jsonb_build_object('en', now())
   WHERE simbolo = p_simbolo;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_tecnico_screener(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_tecnico_screener(text, jsonb) TO authenticated;
