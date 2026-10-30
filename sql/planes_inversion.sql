-- sql/planes_inversion.sql — paso 3 del Builder, «Convertirla en plan»: los PLANES GUARDADOS (docs/builder.md, §48).
--
-- QUÉ. Una fila por plan guardado: su nombre, el plan (el JSON del formato 1 de lib/planes/plan.js, con la foto de la estrategia
-- dentro de su pieza «estrategia»: { id, name, definition, params }) y su huella (sha256 del JSON canónico sin nombre ni descripción,
-- lib/planes/plan.js huellaPlan). Con la foto dentro, un plan guardado se vuelve a calcular igual aunque la estrategia cambie después
-- (la pantalla avisa y deja elegir la versión guardada o la de ahora).
--
-- QUIÉN. user_id = auth.uid() y RLS «dueño», como pruebas_azar, pero los planes NO se congelan: cada usuario lee, crea, cambia y
-- borra SOLO lo suyo. Al crear y al cambiar, solo nombre, plan y huella (permiso por columnas): el dueño lo pone auth.uid() y las fechas,
-- la base (updated_at, el disparador). anon, nada.
--
-- REVERSIÓN: DROP TABLE public.planes_inversion; DROP FUNCTION public.planes_inversion_al_cambiar(); (no los usa nada más).

CREATE TABLE public.planes_inversion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  nombre      text NOT NULL,
  plan        jsonb NOT NULL,
  huella      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planes_inversion_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 200),
  CONSTRAINT planes_inversion_huella CHECK (huella ~ '^[0-9a-f]{64}$'),
  CONSTRAINT planes_inversion_tipo CHECK (plan->>'tipo' = 'plan'),
  CONSTRAINT planes_inversion_tamano CHECK (octet_length(plan::text) <= 204800)
);
CREATE INDEX planes_inversion_usuario ON public.planes_inversion (user_id, updated_at DESC);

CREATE FUNCTION public.planes_inversion_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER planes_inversion_al_cambiar BEFORE UPDATE ON public.planes_inversion FOR EACH ROW EXECUTE FUNCTION public.planes_inversion_al_cambiar();

ALTER TABLE public.planes_inversion ENABLE ROW LEVEL SECURITY;
CREATE POLICY planes_inversion_leer ON public.planes_inversion FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY planes_inversion_insertar ON public.planes_inversion FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY planes_inversion_cambiar ON public.planes_inversion FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY planes_inversion_borrar ON public.planes_inversion FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.planes_inversion FROM anon;
REVOKE ALL ON public.planes_inversion FROM authenticated;
GRANT SELECT, DELETE ON public.planes_inversion TO authenticated;
GRANT INSERT (nombre, plan, huella), UPDATE (nombre, plan, huella) ON public.planes_inversion TO authenticated;
REVOKE ALL ON FUNCTION public.planes_inversion_al_cambiar() FROM PUBLIC, anon, authenticated;
