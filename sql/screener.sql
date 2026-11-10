-- sql/screener.sql — el SCREENER (pestaña «Fundamentales»): las empresas del universo, sus cuentas de la SEC (EDGAR) y las
-- VISTAS guardadas de cada usuario (docs/screener.md).
--
-- QUÉ.
--   · screener_empresas: una fila por empresa del universo (S&P 500 + Nasdaq-100 + los valores de EE. UU. de las listas de la
--     Watchlist; unas 600). Símbolo de Yahoo, CIK de la SEC, nombre, sector (y de dónde sale), si está en cada índice, el último
--     cierre y el PEG esperado de Yahoo («solo hoy»: no hay histórico), con sus fechas, y `metricas`: las cifras que usan los
--     filtros (ROCE, PER…), ya calculadas con lib/screener/metricas.js, para que la pantalla no tenga que leer todas las cuentas.
--     La escribe scripts/cargaScreener.js.
--   · screener_cuentas: las cifras ANUALES (periodo 'FY', del 10-K / 20-F) y de los ÚLTIMOS 12 MESES (periodo 'TTM', sumando
--     trimestres de los 10-Q) que usan los filtros: ventas, beneficio, caja, deuda, flujo de caja… Una fila por empresa, concepto,
--     periodo y fecha de cierre. `etiqueta` dice de qué partida XBRL sale (p. ej. us-gaap:Revenues); `presentado` es el día en que
--     la SEC recibió el documento con esa cifra (la más reciente) y `conocido_desde`, el primer día en que se supo (para, más
--     adelante, probar vistas en el pasado sin ver el futuro). La escribe scripts/cargaScreener.js.
--   · screener_vistas: las vistas guardadas de cada usuario (nombre, orden de las pestañas y la vista: el JSON de
--     lib/screener/vista.js).
--
-- QUIÉN.
--   · empresas y cuentas: datos públicos, iguales para todos. Las lee cualquier usuario con sesión; nadie las escribe desde la
--     app (solo la Management API, que conecta como postgres). anon, nada.
--   · vistas: RLS «dueño», como planes_inversion: cada usuario lee, crea, cambia y borra SOLO lo suyo; al crear y al cambiar, solo
--     nombre, vista y posicion (permiso por columnas). anon, nada.
--
-- REVERSIÓN (no las usa nada más):
--   DROP TABLE public.screener_vistas; DROP FUNCTION public.screener_vistas_al_cambiar();
--   DROP TABLE public.screener_cuentas; DROP TABLE public.screener_empresas;

CREATE TABLE public.screener_empresas (
  simbolo             text PRIMARY KEY,
  cik                 integer,
  nombre              text,
  sic                 integer,
  sic_descripcion     text,
  sector              text,
  sector_fuente       text,
  en_sp500            boolean NOT NULL DEFAULT false,
  en_ndx              boolean NOT NULL DEFAULT false,
  en_listas           boolean NOT NULL DEFAULT false,
  precio              numeric,
  precio_fecha        date,
  peg_esperado        numeric,
  peg_esperado_fecha  date,
  aviso               text,
  metricas            jsonb,
  actualizada         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screener_empresas_simbolo CHECK (simbolo ~ '^[A-Z0-9.^=-]{1,20}$')
);
CREATE INDEX screener_empresas_cik ON public.screener_empresas (cik);

CREATE TABLE public.screener_cuentas (
  cik             integer NOT NULL,
  concepto        text NOT NULL,
  periodo         text NOT NULL,
  fin             date NOT NULL,
  inicio          date,
  anio_fiscal     integer,
  valor           numeric NOT NULL,
  unidad          text NOT NULL,
  etiqueta        text NOT NULL,
  presentado      date NOT NULL,
  conocido_desde  date NOT NULL,
  CONSTRAINT screener_cuentas_pk PRIMARY KEY (cik, concepto, periodo, fin),
  CONSTRAINT screener_cuentas_periodo CHECK (periodo IN ('FY', 'TTM'))
);

ALTER TABLE public.screener_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_cuentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY screener_empresas_lectura ON public.screener_empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY screener_cuentas_lectura ON public.screener_cuentas FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.screener_empresas FROM anon;
REVOKE ALL ON public.screener_cuentas FROM anon;
REVOKE ALL ON public.screener_empresas FROM authenticated;
REVOKE ALL ON public.screener_cuentas FROM authenticated;
GRANT SELECT ON public.screener_empresas TO authenticated;
GRANT SELECT ON public.screener_cuentas TO authenticated;

CREATE TABLE public.screener_vistas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  nombre      text NOT NULL,
  vista       jsonb NOT NULL,
  posicion    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screener_vistas_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 200),
  CONSTRAINT screener_vistas_tipo CHECK (vista->>'tipo' = 'vista_screener'),
  CONSTRAINT screener_vistas_tamano CHECK (octet_length(vista::text) <= 65536)
);
CREATE INDEX screener_vistas_usuario ON public.screener_vistas (user_id, posicion);

CREATE FUNCTION public.screener_vistas_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER screener_vistas_al_cambiar BEFORE UPDATE ON public.screener_vistas FOR EACH ROW EXECUTE FUNCTION public.screener_vistas_al_cambiar();

ALTER TABLE public.screener_vistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY screener_vistas_leer ON public.screener_vistas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY screener_vistas_insertar ON public.screener_vistas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY screener_vistas_cambiar ON public.screener_vistas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY screener_vistas_borrar ON public.screener_vistas FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.screener_vistas FROM anon;
REVOKE ALL ON public.screener_vistas FROM authenticated;
GRANT SELECT, DELETE ON public.screener_vistas TO authenticated;
GRANT INSERT (nombre, vista, posicion), UPDATE (nombre, vista, posicion) ON public.screener_vistas TO authenticated;
REVOKE ALL ON FUNCTION public.screener_vistas_al_cambiar() FROM PUBLIC, anon, authenticated;
