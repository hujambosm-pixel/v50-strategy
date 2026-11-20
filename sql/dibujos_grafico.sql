-- sql/dibujos_grafico.sql — los DIBUJOS sobre el gráfico de un valor (líneas, Fibonacci, rectángulos, posiciones…), por usuario y valor
-- (docs/builder.md §206). Parte 1 de «Dibujar sobre los gráficos»: solo la tabla; la pantalla todavía no la usa.
--
-- QUÉ. Una fila por usuario y valor: la lista de sus dibujos (dibujos: [{ id, tipo, puntos: [{ fecha 'AAAA-MM-DD', precio }], estilo… }]).
-- Cada punto va por FECHA y PRECIO, no por vela: así los mismos dibujos valen en diario y en semanal. El formato de cada dibujo lo decide
-- la app (lib/dibujos/); la base solo exige que sea una lista y que no pase de 200 KB por valor.
--
-- QUIÉN. user_id = auth.uid() y RLS «dueño»: cada usuario lee, crea, cambia y borra SOLO lo suyo. Al crear y al
-- cambiar, solo simbolo y dibujos (permiso por columnas; el upsert de la app manda los dos): el dueño lo pone auth.uid() y updated_at, la base (el disparador). anon, nada.
--
-- REVERSIÓN: DROP TABLE public.dibujos_grafico; DROP FUNCTION public.dibujos_grafico_al_cambiar(); (no los usa nada más).

CREATE TABLE public.dibujos_grafico (
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  simbolo     text NOT NULL,
  dibujos     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, simbolo),
  CONSTRAINT dibujos_grafico_simbolo CHECK (simbolo = upper(btrim(simbolo)) AND length(simbolo) BETWEEN 1 AND 30),
  CONSTRAINT dibujos_grafico_dibujos CHECK (jsonb_typeof(dibujos) = 'array' AND octet_length(dibujos::text) <= 204800)
);

CREATE FUNCTION public.dibujos_grafico_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER dibujos_grafico_al_cambiar BEFORE UPDATE ON public.dibujos_grafico FOR EACH ROW EXECUTE FUNCTION public.dibujos_grafico_al_cambiar();

ALTER TABLE public.dibujos_grafico ENABLE ROW LEVEL SECURITY;
CREATE POLICY dibujos_grafico_leer ON public.dibujos_grafico FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY dibujos_grafico_insertar ON public.dibujos_grafico FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY dibujos_grafico_cambiar ON public.dibujos_grafico FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY dibujos_grafico_borrar ON public.dibujos_grafico FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.dibujos_grafico FROM anon;
REVOKE ALL ON public.dibujos_grafico FROM authenticated;
GRANT SELECT, DELETE ON public.dibujos_grafico TO authenticated;
GRANT INSERT (simbolo, dibujos), UPDATE (simbolo, dibujos) ON public.dibujos_grafico TO authenticated;
REVOKE ALL ON FUNCTION public.dibujos_grafico_al_cambiar() FROM PUBLIC, anon, authenticated;
