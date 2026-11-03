-- sql/builder_pestanas.sql — paso 3 del Builder: las PESTAÑAS DE PLANES abiertas y su orden, por usuario (docs/builder.md, §54).
--
-- QUÉ. Una fila por usuario: los ids de los planes guardados que tiene abiertos, en orden. No es una referencia: si un plan de la lista ya no existe, la pantalla lo ignora
-- (lib/builder/pestanasPlan.js ordenInicial) y la lista se limpia la siguiente vez que se guarda. Un plan nuevo sin guardar no se recuerda.
--
-- QUIÉN. user_id = auth.uid() y RLS «dueño»: cada usuario lee, crea y cambia SOLO su fila. Al crear y al cambiar, solo planes (permiso por columnas): el dueño lo pone auth.uid() y
-- updated_at, la base (el disparador). Sin DELETE: no hace falta. Al borrar la cuenta se va con ella. anon, nada.
--
-- REVERSIÓN: DROP TABLE public.builder_pestanas; DROP FUNCTION public.builder_pestanas_al_cambiar(); (no los usa nada más; la pantalla, sin la tabla, abre todos los planes y lo avisa al guardar).

CREATE TABLE public.builder_pestanas (
  user_id     uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  planes      bigint[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT builder_pestanas_tamano CHECK (coalesce(array_length(planes, 1), 0) <= 500)
);

CREATE FUNCTION public.builder_pestanas_al_cambiar() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER builder_pestanas_al_cambiar BEFORE UPDATE ON public.builder_pestanas FOR EACH ROW EXECUTE FUNCTION public.builder_pestanas_al_cambiar();

ALTER TABLE public.builder_pestanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_pestanas_leer ON public.builder_pestanas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY builder_pestanas_insertar ON public.builder_pestanas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY builder_pestanas_cambiar ON public.builder_pestanas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.builder_pestanas FROM anon;
REVOKE ALL ON public.builder_pestanas FROM authenticated;
GRANT SELECT ON public.builder_pestanas TO authenticated;
GRANT INSERT (planes), UPDATE (planes) ON public.builder_pestanas TO authenticated;
REVOKE ALL ON FUNCTION public.builder_pestanas_al_cambiar() FROM PUBLIC, anon, authenticated;
