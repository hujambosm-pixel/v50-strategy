-- sql/precios_cache.sql — caché COMPARTIDA de velas diarias CERRADAS.
--
-- POR QUÉ. Los backtests, el ranking y el futuro optimizador descargan de Yahoo los mismos precios una
-- y otra vez: un recálculo completo del ranking hace unas 24.000 peticiones para 162 activos. Guardar
-- las velas diarias aquí lo hace más rápido, evita bloqueos de Yahoo y hace que dos ejecuciones iguales
-- vean exactamente los mismos datos.
--
-- QUÉ SE GUARDA. Solo velas diarias CERRADAS, tal como las da Yahoo (ajustadas por splits, no por
-- dividendos). La vela en curso nunca se guarda, y las semanales se siguen derivando de las diarias
-- (lib/velasSemanales.js). DOUBLE PRECISION y no NUMERIC: guarda exactamente el número que llega de
-- Yahoo, que es lo que permite que un backtest con caché salga idéntico a uno sin ella.
--
-- QUIÉN. Es una caché sin dueño (como fx_rates), pero a diferencia de fx_rates el cliente NO puede
-- escribir en las tablas: un precio falso contaminaría todos los backtests. Se lee con SELECT
-- (authenticated) o con leer_velas; se escribe solo con guardar_velas, que valida cada vela y exige un
-- usuario autenticado. Las rutas del servidor la llaman con el token del usuario que ya reciben.
--
-- REVERSIÓN: backups/precios_cache_reversion_<fecha>.sql (borra las dos tablas y las dos funciones).

-- ── Tablas ────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.precios_diarios (
  simbolo  text             NOT NULL,
  fecha    date             NOT NULL,
  open     double precision NOT NULL,
  high     double precision NOT NULL,
  low      double precision NOT NULL,
  close    double precision NOT NULL,
  volumen  bigint,
  PRIMARY KEY (simbolo, fecha)          -- cubre las consultas por símbolo y rango de fechas
);

-- Estado por símbolo: qué rango hay, cuándo se comprobó contra Yahoo y cuándo/por qué se recargó entero
-- (un split reescribe todo el histórico hacia atrás).
CREATE TABLE public.precios_simbolos (
  simbolo         text PRIMARY KEY,
  primera_fecha   date,
  ultima_fecha    date,
  velas           integer NOT NULL DEFAULT 0,
  revisado_en     timestamptz,
  recargado_en    timestamptz,
  motivo_recarga  text
);

-- ── RLS: lectura para usuarios autenticados; ninguna escritura directa ───────────────────────────────
ALTER TABLE public.precios_diarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precios_simbolos ENABLE ROW LEVEL SECURITY;

CREATE POLICY precios_diarios_lectura  ON public.precios_diarios  FOR SELECT TO authenticated USING (true);
CREATE POLICY precios_simbolos_lectura ON public.precios_simbolos FOR SELECT TO authenticated USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE, RLS ya lo impide; se retiran además los permisos para que el
-- intento falle por permiso y no se quede en un «0 filas» silencioso. anon no lee nada.
REVOKE ALL    ON public.precios_diarios, public.precios_simbolos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
              ON public.precios_diarios, public.precios_simbolos FROM authenticated;

-- ── guardar_velas: la ÚNICA vía de escritura ─────────────────────────────────────────────────────────
-- p_filas: [{ "fecha": "2024-06-07", "open": …, "high": …, "low": …, "close": …, "volumen": … }, …]
-- Valida TODAS las velas antes de escribir ninguna (todo o nada):
--   · usuario autenticado (auth.uid() no nulo);
--   · fecha, open, high, low y close presentes; precios positivos; low <= open, close <= high;
--   · fecha ANTERIOR a hoy (UTC): ni la vela de hoy ni una futura, que pueden no haber cerrado;
--   · sin fechas repetidas.
-- p_reemplazar = true borra antes todas las velas del símbolo (recarga completa tras un split) y anota
-- recargado_en y p_motivo. Con p_filas vacío solo marca revisado_en (comprobado contra Yahoo, sin
-- cambios). Devuelve cuántas velas se han escrito.
CREATE FUNCTION public.guardar_velas(p_simbolo text, p_filas jsonb,
                                     p_reemplazar boolean DEFAULT false, p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v      record;
  n      integer := 0;
  total  integer;
  dist   integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'guardar_velas: hace falta un usuario autenticado';
  END IF;
  IF p_simbolo IS NULL OR length(trim(p_simbolo)) = 0 OR length(p_simbolo) > 32 THEN
    RAISE EXCEPTION 'guardar_velas: símbolo no válido (%)', p_simbolo;
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'guardar_velas: las velas tienen que llegar como un array JSON';
  END IF;
  IF jsonb_array_length(p_filas) > 12000 THEN
    RAISE EXCEPTION 'guardar_velas: demasiadas velas en una llamada (%; máximo 12000)', jsonb_array_length(p_filas);
  END IF;

  FOR v IN
    SELECT * FROM jsonb_to_recordset(p_filas)
      AS x(fecha date, open double precision, high double precision, low double precision,
           close double precision, volumen bigint)
  LOOP
    IF v.fecha IS NULL OR v.open IS NULL OR v.high IS NULL OR v.low IS NULL OR v.close IS NULL THEN
      RAISE EXCEPTION 'guardar_velas: vela incompleta (%)', row_to_json(v);
    END IF;
    IF v.fecha >= (now() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'guardar_velas: la vela del % es de hoy o futura: solo se guardan velas cerradas', v.fecha;
    END IF;
    IF v.low <= 0 OR NOT (v.low <= v.open AND v.open <= v.high AND v.low <= v.close AND v.close <= v.high) THEN
      RAISE EXCEPTION 'guardar_velas: vela del % incoherente (open %, high %, low %, close %)',
        v.fecha, v.open, v.high, v.low, v.close;
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT x.fecha) INTO total, dist
    FROM jsonb_to_recordset(p_filas) AS x(fecha date);
  IF total <> dist THEN
    RAISE EXCEPTION 'guardar_velas: hay fechas repetidas en las velas';
  END IF;

  IF p_reemplazar THEN
    DELETE FROM public.precios_diarios WHERE simbolo = p_simbolo;
  END IF;

  INSERT INTO public.precios_diarios (simbolo, fecha, open, high, low, close, volumen)
  SELECT p_simbolo, x.fecha, x.open, x.high, x.low, x.close, x.volumen
    FROM jsonb_to_recordset(p_filas)
      AS x(fecha date, open double precision, high double precision, low double precision,
           close double precision, volumen bigint)
  ON CONFLICT (simbolo, fecha) DO UPDATE
    SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        close = EXCLUDED.close, volumen = EXCLUDED.volumen;
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.precios_simbolos AS s (simbolo, primera_fecha, ultima_fecha, velas, revisado_en,
                                           recargado_en, motivo_recarga)
  SELECT p_simbolo, min(d.fecha), max(d.fecha), count(*), now(),
         CASE WHEN p_reemplazar THEN now() END, CASE WHEN p_reemplazar THEN p_motivo END
    FROM public.precios_diarios d WHERE d.simbolo = p_simbolo
  ON CONFLICT (simbolo) DO UPDATE
    SET primera_fecha  = EXCLUDED.primera_fecha,
        ultima_fecha   = EXCLUDED.ultima_fecha,
        velas          = EXCLUDED.velas,
        revisado_en    = now(),
        recargado_en   = CASE WHEN p_reemplazar THEN now() ELSE s.recargado_en END,
        motivo_recarga = CASE WHEN p_reemplazar THEN p_motivo ELSE s.motivo_recarga END;

  RETURN n;
END;
$$;

-- ── leer_velas: un rango de un símbolo, sin el límite de 1.000 filas de PostgREST ─────────────────────
-- Devuelve UN objeto JSON por columnas —{ fecha: [...], open: [...], high, low, close, volumen }—, que
-- ocupa la mitad que una fila por vela y es lo que se transfiere en cada backtest. SECURITY INVOKER: la
-- lectura pasa por la política de RLS de la tabla.
-- extra_float_digits = 1: el servidor de Supabase tiene extra_float_digits = 0, y con eso un double sale
-- en el JSON redondeado a 15 cifras (2.63571405410767 en vez de 2.635714054107666). Con 1 sale el valor
-- guardado exacto, idéntico (===) al de Yahoo. Se añadió después con
--   ALTER FUNCTION public.leer_velas(text, date, date) SET extra_float_digits = 1;
CREATE FUNCTION public.leer_velas(p_simbolo text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET extra_float_digits = 1
AS $$
  SELECT jsonb_build_object(
    'simbolo', p_simbolo,
    'fecha',   coalesce(jsonb_agg(d.fecha   ORDER BY d.fecha), '[]'::jsonb),
    'open',    coalesce(jsonb_agg(d.open    ORDER BY d.fecha), '[]'::jsonb),
    'high',    coalesce(jsonb_agg(d.high    ORDER BY d.fecha), '[]'::jsonb),
    'low',     coalesce(jsonb_agg(d.low     ORDER BY d.fecha), '[]'::jsonb),
    'close',   coalesce(jsonb_agg(d.close   ORDER BY d.fecha), '[]'::jsonb),
    'volumen', coalesce(jsonb_agg(d.volumen ORDER BY d.fecha), '[]'::jsonb))
  FROM public.precios_diarios d
  WHERE d.simbolo = p_simbolo
    AND (p_desde IS NULL OR d.fecha >= p_desde)
    AND (p_hasta IS NULL OR d.fecha <= p_hasta);
$$;

-- ── Permisos de las funciones: solo usuarios autenticados ────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.guardar_velas(text, jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leer_velas(text, date, date)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_velas(text, jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leer_velas(text, date, date)             TO authenticated;
