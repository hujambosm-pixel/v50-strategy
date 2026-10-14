-- sql/precios_aviso_historia.sql — aviso de historia protegida en la caché de precios (Fase 8a, paso 1b).
--
-- Yahoo da la historia del ticker de HOY: al deslistar un valor la recorta y, si otra empresa reutiliza el
-- ticker, da la de esa. Antes de borrar o sustituir velas guardadas, la caché comprueba que lo nuevo cubre lo
-- que ya tiene (revisaHistoria, lib/cachePrecios.js). Si no, no borra ni sustituye nada, solo añade las velas
-- posteriores a la última guardada, y anota aquí por qué.
--
-- precios_simbolos.aviso_historia / aviso_en: el último aviso y cuándo. No los toca guardar_velas: quedan hasta
-- el siguiente aviso. Lectura con las políticas de siempre (authenticated); escritura solo con la función.
ALTER TABLE public.precios_simbolos ADD COLUMN aviso_historia text;
ALTER TABLE public.precios_simbolos ADD COLUMN aviso_en timestamptz;

-- anotar_aviso_historia: anota el aviso en un símbolo que ya está en la caché. Devuelve si lo ha anotado.
CREATE FUNCTION public.anotar_aviso_historia(p_simbolo text, p_aviso text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'anotar_aviso_historia: hace falta un usuario autenticado';
  END IF;
  IF p_aviso IS NULL OR length(trim(p_aviso)) = 0 THEN
    RAISE EXCEPTION 'anotar_aviso_historia: aviso vacío';
  END IF;
  UPDATE public.precios_simbolos SET aviso_historia = left(p_aviso, 500), aviso_en = now() WHERE simbolo = p_simbolo;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.anotar_aviso_historia(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anotar_aviso_historia(text, text) TO authenticated;
