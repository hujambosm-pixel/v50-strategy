-- sql/universo_miembros.sql — miembros HISTÓRICOS de índices (Fase 8a): cada tramo en que un valor perteneció a un índice.
--
-- QUÉ. Una fila por tramo: un valor puede entrar, salir y volver a entrar. «desde» es el primer día como miembro y «hasta»
-- el primer día ya fuera (la fecha efectiva del cambio); NULL si sigue siendo miembro. simbolo es el ticker actual (o el
-- último) del valor; simbolo_yahoo, el que sirve para pedir sus precios a Yahoo (NULL si ese ticker lo usa hoy otra
-- empresa). La llena scripts/universoNasdaq100.js (indice 'NDX') a partir de Wikipedia.
--
-- QUIÉN. Como precios_simbolos: la app solo la LEE (authenticated); nadie la escribe desde el cliente. El script escribe
-- por la Management API.
--
-- REVERSIÓN: DROP TABLE public.universo_miembros; (no la usa nada más).

CREATE TABLE public.universo_miembros (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  indice         text NOT NULL,
  simbolo        text NOT NULL,
  simbolo_yahoo  text,
  nombre         text,
  desde          date NOT NULL,
  hasta          date,
  motivo_salida  text,
  fuente         text,
  CONSTRAINT universo_miembros_fechas CHECK (hasta IS NULL OR hasta > desde),
  -- Dos empresas pueden haber usado el mismo ticker (MNST: Monster Worldwide y Monster Beverage): de ahí el nombre.
  CONSTRAINT universo_miembros_unico UNIQUE (indice, simbolo, nombre, desde)
);
CREATE INDEX universo_miembros_indice_fechas ON public.universo_miembros (indice, desde, hasta);
CREATE INDEX universo_miembros_yahoo ON public.universo_miembros (simbolo_yahoo);

ALTER TABLE public.universo_miembros ENABLE ROW LEVEL SECURITY;
CREATE POLICY universo_miembros_lectura ON public.universo_miembros FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.universo_miembros FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.universo_miembros FROM authenticated;
