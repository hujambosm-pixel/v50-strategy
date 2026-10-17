-- sql/universo_regenera.sql — «Regenerar universo» desde la app (V9.994): escribir en public.universo_screener la selección de
-- UN año (las dos reglas, N = 10, 20 y 30) que la app calcula con lib/screener.js, con el mismo procedimiento que
-- scripts/generaScreener.js (V9.991): copia previa, registro de cada escritura y huella para revertir.
--
-- QUÉ.
--   · public.universo_screener_escrituras: una fila por escritura: el año, la COPIA de las filas de ese año antes de
--     escribir, las filas escritas, la huella de antes y la de después, quién y cuándo, y si se revirtió.
--   · regenera_universo_anio(p_anio, p_filas): comprueba las filas (reglas volatilidad / momentum, N 10 / 20 / 30, puestos
--     1…N seguidos, símbolos del universo), guarda la copia, borra las filas de ese año y escribe las nuevas, en UNA
--     transacción; devuelve el id del registro y las dos huellas.
--   · revierte_universo_escritura(p_id): vuelve a poner la copia, solo si las filas de ese año siguen siendo las que
--     escribió (misma huella); si alguien las cambió después, no toca nada.
-- Huella: md5 de las filas del año en orden (regla, n, posicion), con la medida en su texto exacto (extra_float_digits = 1).
--
-- QUIÉN. La tabla del universo sigue sin poder escribirse desde el cliente: solo por estas dos funciones (SECURITY DEFINER),
-- para usuarios autenticados.
--
-- REVERSIÓN DE ESTE SQL: DROP FUNCTION public.regenera_universo_anio(int, jsonb); DROP FUNCTION
-- public.revierte_universo_escritura(bigint); DROP TABLE public.universo_screener_escrituras;

CREATE TABLE IF NOT EXISTS public.universo_screener_escrituras (
  id              bigserial PRIMARY KEY,
  creado          timestamptz NOT NULL DEFAULT now(),
  usuario         uuid DEFAULT auth.uid(),
  anio            int NOT NULL,
  copia           jsonb NOT NULL,
  filas           jsonb NOT NULL,
  huella_antes    text NOT NULL,
  huella_despues  text NOT NULL,
  revertida       timestamptz
);
ALTER TABLE public.universo_screener_escrituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS universo_screener_escrituras_lectura ON public.universo_screener_escrituras;
CREATE POLICY universo_screener_escrituras_lectura ON public.universo_screener_escrituras FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.universo_screener_escrituras FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.universo_screener_escrituras FROM authenticated;

CREATE OR REPLACE FUNCTION public.huella_universo_anio(p_anio int) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET extra_float_digits = 1 AS $$
  SELECT md5(coalesce(string_agg(regla || '|' || n || '|' || anio || '|' || posicion || '|' || simbolo_yahoo || '|' || coalesce(volatilidad::text, ''), ','
    ORDER BY regla, n, posicion), '')) FROM public.universo_screener WHERE anio = p_anio
$$;

CREATE OR REPLACE FUNCTION public.regenera_universo_anio(p_anio int, p_filas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET extra_float_digits = 1 AS $$
DECLARE v_antes text; v_despues text; v_copia jsonb; v_id bigint; v_malas int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'hace falta una sesión'; END IF;
  IF p_anio < 2016 OR p_anio > extract(year FROM now())::int THEN RAISE EXCEPTION 'año fuera de rango: %', p_anio; END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN RAISE EXCEPTION 'sin filas'; END IF;
  -- Las filas: reglas y N conocidos, el año pedido, puestos 1…N seguidos y sin repetir, símbolos del universo.
  SELECT count(*) INTO v_malas FROM jsonb_array_elements(p_filas) f
    WHERE (f->>'regla') NOT IN ('volatilidad', 'momentum') OR (f->>'n')::int NOT IN (10, 20, 30) OR (f->>'anio')::int <> p_anio
       OR (f->>'posicion')::int < 1 OR (f->>'posicion')::int > (f->>'n')::int
       OR NOT EXISTS (SELECT 1 FROM public.universo_miembros m WHERE m.simbolo_yahoo = f->>'simbolo_yahoo');
  IF v_malas > 0 THEN RAISE EXCEPTION '% filas no válidas', v_malas; END IF;
  SELECT count(*) INTO v_malas FROM (SELECT f->>'regla' r, (f->>'n')::int n, count(*) c, max((f->>'posicion')::int) mx, count(DISTINCT f->>'posicion') dp, count(DISTINCT f->>'simbolo_yahoo') ds
    FROM jsonb_array_elements(p_filas) f GROUP BY 1, 2) g WHERE g.c <> g.mx OR g.dp <> g.c OR g.ds <> g.c;
  IF v_malas > 0 THEN RAISE EXCEPTION 'puestos o símbolos repetidos o con huecos en % grupos', v_malas; END IF;
  v_antes := public.huella_universo_anio(p_anio);
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY regla, n, posicion), '[]'::jsonb) INTO v_copia FROM public.universo_screener s WHERE anio = p_anio;
  DELETE FROM public.universo_screener WHERE anio = p_anio;
  INSERT INTO public.universo_screener (regla, n, anio, simbolo_yahoo, posicion, volatilidad)
    SELECT f->>'regla', (f->>'n')::int, p_anio, f->>'simbolo_yahoo', (f->>'posicion')::int, (f->>'volatilidad')::double precision FROM jsonb_array_elements(p_filas) f;
  v_despues := public.huella_universo_anio(p_anio);
  INSERT INTO public.universo_screener_escrituras (anio, copia, filas, huella_antes, huella_despues) VALUES (p_anio, v_copia, p_filas, v_antes, v_despues) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'anio', p_anio, 'huella_antes', v_antes, 'huella_despues', v_despues, 'filas_antes', jsonb_array_length(v_copia), 'filas', jsonb_array_length(p_filas));
END $$;

CREATE OR REPLACE FUNCTION public.revierte_universo_escritura(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET extra_float_digits = 1 AS $$
DECLARE e public.universo_screener_escrituras; v_ahora text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'hace falta una sesión'; END IF;
  SELECT * INTO e FROM public.universo_screener_escrituras WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no existe la escritura %', p_id; END IF;
  IF e.revertida IS NOT NULL THEN RAISE EXCEPTION 'la escritura % ya se revirtió', p_id; END IF;
  v_ahora := public.huella_universo_anio(e.anio);
  IF v_ahora IS DISTINCT FROM e.huella_despues THEN RAISE EXCEPTION 'las filas de % han cambiado desde la escritura % (huella %): no se revierte', e.anio, p_id, v_ahora; END IF;
  DELETE FROM public.universo_screener WHERE anio = e.anio;
  INSERT INTO public.universo_screener (regla, n, anio, simbolo_yahoo, posicion, volatilidad)
    SELECT c->>'regla', (c->>'n')::int, (c->>'anio')::int, c->>'simbolo_yahoo', (c->>'posicion')::int, (c->>'volatilidad')::double precision FROM jsonb_array_elements(e.copia) c;
  UPDATE public.universo_screener_escrituras SET revertida = now() WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'anio', e.anio, 'huella', public.huella_universo_anio(e.anio));
END $$;

REVOKE ALL ON FUNCTION public.regenera_universo_anio(int, jsonb), public.revierte_universo_escritura(bigint), public.huella_universo_anio(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenera_universo_anio(int, jsonb), public.revierte_universo_escritura(bigint), public.huella_universo_anio(int) TO authenticated;
