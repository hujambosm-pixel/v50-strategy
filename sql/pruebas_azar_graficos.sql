-- sql/pruebas_azar_graficos.sql — lo que dibuja el resultado del paso 2 (docs/builder.md, §61): por cada una de las 3 pestañas, las 5 líneas del abanico del azar y las operaciones
-- de las 3 copias (la mejor, la típica y la peor). Los datos son los de lib/azarGraficos.js calculaGraficos.
--
-- APARTE, A PROPÓSITO: no entran en el veredicto, ni en la foto, ni en ninguna huella. pruebas_azar y pruebas_azar_resultados no cambian.
-- QUIÉN: como pruebas_azar_resultados: user_id = auth.uid() y RLS «dueño»; leer e insertar lo suyo, y solo en una prueba propia. Sin cambiar. Se va con su prueba (ON DELETE CASCADE).
--
-- REVERSIÓN: DROP TABLE public.pruebas_azar_graficos; (no la usa nada más; sin ella, el resultado no puede dibujar el gráfico, pero sigue enseñando su veredicto.)

BEGIN;
CREATE TABLE public.pruebas_azar_graficos (
  prueba_id    bigint PRIMARY KEY REFERENCES public.pruebas_azar(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  datos        jsonb NOT NULL,
  version_app  text,
  CONSTRAINT pruebas_azar_graficos_tamano CHECK (octet_length(datos::text) <= 1048576)
);
ALTER TABLE public.pruebas_azar_graficos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pruebas_azar_graficos_leer ON public.pruebas_azar_graficos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pruebas_azar_graficos_insertar ON public.pruebas_azar_graficos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.pruebas_azar p WHERE p.id = prueba_id AND p.user_id = auth.uid()));
REVOKE ALL ON public.pruebas_azar_graficos FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pruebas_azar_graficos FROM authenticated;
GRANT SELECT, INSERT ON public.pruebas_azar_graficos TO authenticated;
COMMIT;
