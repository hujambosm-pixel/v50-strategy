-- sql/tesis_inversion.sql — la pantalla «Tesis» (V9.1092, docs/tesis.md): las TESIS DE INVERSIÓN, ideas en texto libre.
--
-- QUÉ. Una fila por tesis: su título, el texto (libre, hasta 100 KB), su estado (idea, en estudio, en marcha, descartada), los enlaces a
-- estrategias y planes relacionados (relacionados: [{ tipo: 'estrategia' | 'plan', id }]) y cuándo se revisó por última vez (revisada_en,
-- la pone la pantalla al guardar y con «Marcar como revisada hoy»). Sin historial: se guarda solo la versión actual.
--
-- QUIÉN. Como planes_inversion: user_id = auth.uid() y RLS «dueño»: cada usuario lee, crea, cambia y borra SOLO lo suyo. Al crear y al
-- cambiar, solo titulo, texto, estado, relacionados y revisada_en (permiso por columnas): el dueño lo pone auth.uid(); created_at y
-- updated_at, la base (updated_at, el disparador). anon, nada.
--
-- REVERSIÓN: DROP TABLE public.tesis_inversion; DROP FUNCTION public.tesis_inversion_al_cambiar(); (no los usa nada más).

CREATE TABLE public.tesis_inversion (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  titulo       text NOT NULL,
  texto        text NOT NULL DEFAULT '',
  estado       text NOT NULL DEFAULT 'idea',
  relacionados jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  revisada_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tesis_inversion_titulo CHECK (titulo = btrim(titulo) AND length(titulo) BETWEEN 1 AND 200),
  CONSTRAINT tesis_inversion_texto CHECK (octet_length(texto) <= 102400),
  CONSTRAINT tesis_inversion_estado CHECK (estado IN ('idea', 'estudio', 'marcha', 'descartada')),
  CONSTRAINT tesis_inversion_relacionados CHECK (jsonb_typeof(relacionados) = 'array' AND octet_length(relacionados::text) <= 20480)
);
CREATE INDEX tesis_inversion_usuario ON public.tesis_inversion (user_id, revisada_en DESC);

CREATE FUNCTION public.tesis_inversion_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER tesis_inversion_al_cambiar BEFORE UPDATE ON public.tesis_inversion FOR EACH ROW EXECUTE FUNCTION public.tesis_inversion_al_cambiar();

ALTER TABLE public.tesis_inversion ENABLE ROW LEVEL SECURITY;
CREATE POLICY tesis_inversion_leer ON public.tesis_inversion FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY tesis_inversion_insertar ON public.tesis_inversion FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY tesis_inversion_cambiar ON public.tesis_inversion FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY tesis_inversion_borrar ON public.tesis_inversion FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.tesis_inversion FROM anon;
REVOKE ALL ON public.tesis_inversion FROM authenticated;
GRANT SELECT, DELETE ON public.tesis_inversion TO authenticated;
GRANT INSERT (titulo, texto, estado, relacionados, revisada_en), UPDATE (titulo, texto, estado, relacionados, revisada_en) ON public.tesis_inversion TO authenticated;
REVOKE ALL ON FUNCTION public.tesis_inversion_al_cambiar() FROM PUBLIC, anon, authenticated;
