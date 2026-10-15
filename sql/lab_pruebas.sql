-- sql/lab_pruebas.sql — registro de pruebas del laboratorio de señales (lib/registroLab.js).
--
-- QUÉ. Una fila por prueba ejecutada: cuándo, con qué versión de la app, su configuración (señales y parámetros,
-- universo, periodos, temporalidad, entrada y salida), la huella de esa configuración (sha256 del JSON canónico,
-- lib/lotesLab.js) y un RESUMEN de resultados (como mucho 50 KB). oficial = true solo si la huella coincide con un
-- elemento de un lote declarado (entonces lote e item_lote dicen cuál); el resto son exploratorias.
--
-- QUIÉN. Como las demás tablas del usuario: user_id = auth.uid() y RLS «dueño». Es de SOLO AÑADIR: el usuario puede leer
-- e insertar sus pruebas, no cambiarlas ni borrarlas (el registro sirve para contar cuántas cosas se probaron).
--
-- REVERSIÓN: DROP TABLE public.lab_pruebas; (no la usa nada más).

CREATE TABLE public.lab_pruebas (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  creado       timestamptz NOT NULL DEFAULT now(),
  version_app  text,
  lote         text,
  item_lote    text,
  oficial      boolean NOT NULL DEFAULT false,
  config       jsonb NOT NULL,
  hash_config  text NOT NULL,
  resultados   jsonb,
  CONSTRAINT lab_pruebas_hash CHECK (hash_config ~ '^[0-9a-f]{64}$'),
  CONSTRAINT lab_pruebas_oficial_con_lote CHECK (NOT oficial OR (lote IS NOT NULL AND item_lote IS NOT NULL)),
  CONSTRAINT lab_pruebas_libre_sin_lote CHECK (oficial OR (lote IS NULL AND item_lote IS NULL)),
  CONSTRAINT lab_pruebas_resultados_tamano CHECK (resultados IS NULL OR octet_length(resultados::text) <= 51200)
);
CREATE INDEX lab_pruebas_usuario_creado ON public.lab_pruebas (user_id, creado DESC);
CREATE INDEX lab_pruebas_hash_config ON public.lab_pruebas (hash_config);

ALTER TABLE public.lab_pruebas ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_pruebas_leer ON public.lab_pruebas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY lab_pruebas_insertar ON public.lab_pruebas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.lab_pruebas FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lab_pruebas FROM authenticated;
GRANT SELECT, INSERT ON public.lab_pruebas TO authenticated;
