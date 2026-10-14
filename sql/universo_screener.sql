-- sql/universo_screener.sql — selecciones del screener por reglas (Fase 8a): qué miembros del índice elige cada regla cada
-- 1 de enero.
--
-- QUÉ. Una fila por (regla, N, año, puesto): el valor elegido (símbolo de Yahoo) y su medida. Para la regla «volatilidad»
-- (lib/screener.js: los N miembros con mayor volatilidad del año anterior), volatilidad es la del año anio − 1. La llena
-- scripts/generaScreener.js. La app reconstruye la máscara de entradas con mascaraUniverso (lib/screener.js) a partir de
-- esta tabla y de universo_miembros (las salidas del índice a mitad de año cortan las entradas).
--
-- QUIÉN. Como universo_miembros: la app solo la LEE (authenticated); nadie la escribe desde el cliente. El script escribe
-- por la Management API.
--
-- REVERSIÓN: DROP TABLE public.universo_screener; (no la usa nada más que el multibacktest con universo dinámico, que sin
-- ella avisa de que no hay selección).

CREATE TABLE public.universo_screener (
  regla          text NOT NULL,
  n              int NOT NULL CHECK (n > 0),
  anio           int NOT NULL,
  simbolo_yahoo  text NOT NULL,
  posicion       int NOT NULL CHECK (posicion >= 1),
  volatilidad    double precision,
  CONSTRAINT universo_screener_pk PRIMARY KEY (regla, n, anio, posicion),
  CONSTRAINT universo_screener_simbolo_unico UNIQUE (regla, n, anio, simbolo_yahoo),
  CONSTRAINT universo_screener_puesto CHECK (posicion <= n)
);

ALTER TABLE public.universo_screener ENABLE ROW LEVEL SECURITY;
CREATE POLICY universo_screener_lectura ON public.universo_screener FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.universo_screener FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.universo_screener FROM authenticated;
